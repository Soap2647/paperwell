# LayerD (cyberagent/layerd-birefnet, Apache-2.0) ağırlıklarını BiRefNet ONNX grafiğine yerleştirip fp16'ya çevirir.
# LayerD'nin ya da BiRefNet'in Python kodu çalıştırılmaz: yalnız onnx, numpy, safetensors ve onnxruntime'ın fp16 dönüştürücüsü.
#
# Eşleme değerle kurulur: onnx-community/BiRefNet-ONNX (fp32) resmi BiRefNet ağırlıklarından (ZhengPeng7/BiRefNet, MIT,
# fp32 revizyon 66f7f80c) dışa aktarılmıştır. ONNX'teki her sabit için resmi ağırlığa hangi dönüşüm (aynen, devrik,
# göreli konum tablosu, BatchNorm ile birleşik konvolüsyon) uygulanınca o sabitin çıktığı bulunur; aynısı LayerD'ye uygulanır.
# Eşlenemeyen sabit kalırsa betik durur.
#
# python -I scripts/layerd_onnx.py official.safetensors layerd.safetensors birefnet_fp32.onnx layerd_fp16.onnx
#   official.safetensors: huggingface.co/ZhengPeng7/BiRefNet/resolve/66f7f80c1a64b3c4df327a07eeca4e87130b787b/model.safetensors
#   layerd.safetensors:   huggingface.co/cyberagent/layerd-birefnet/resolve/679f743cd001fb5d6360e59e8e1904678c5fa734/model.safetensors
#   birefnet_fp32.onnx:   huggingface.co/onnx-community/BiRefNet-ONNX/resolve/534d3c82d3bb8b2f0867db6dfbc3a525b8e42f67/onnx/model.onnx
import sys
import collections

import numpy as np
import onnx
from onnx import numpy_helper
from onnxruntime.transformers.float16 import convert_float_to_float16
from safetensors.numpy import load_file

O, L = load_file(sys.argv[1]), load_file(sys.argv[2])
assert set(O) == set(L) and all(O[k].shape == L[k].shape for k in O), 'mimari farklı'
m = onnx.load(sys.argv[3])
f32 = lambda a: a.astype(np.float32)
close = lambda a, b: a.shape == b.shape and np.allclose(a, b, rtol=1e-4, atol=1e-6)
bn_scale = lambda D, p: f32(D[p + 'weight']) / np.sqrt(f32(D[p + 'running_var']) + 1e-5)

by_shape = collections.defaultdict(list)
for k, v in O.items():
    by_shape[v.shape].append(k)
bns = {k[: -len('running_var')]: bn_scale(O, k[: -len('running_var')]) for k in O if k.endswith('.running_var')}


def bias_table(D, p, n):
    t, idx = f32(D[p + 'relative_position_bias_table']), D[p + 'relative_position_index'].reshape(-1)
    return t[idx].reshape(n, n, t.shape[1]).transpose(2, 0, 1)[None]


new, fused, done = {}, [], collections.Counter()
for init in m.graph.initializer:
    V = numpy_helper.to_array(init)
    if V.dtype != np.float32:
        continue
    name, hit = init.name, None
    if name in O:
        assert close(f32(O[name]), V), f'ONNX resmi ağırlıklardan değil: {name}'
        hit = f32(L[name]); done['aynen'] += 1
    elif V.ndim == 2:
        k = next((k for k in by_shape.get(V.T.shape, []) if close(f32(O[k]).T, V)), None)
        if k:
            hit = f32(L[k]).T; done['devrik'] += 1
    elif V.ndim == 4 and V.shape[0] == 1 and V.shape[2] == V.shape[3]:
        p = next((k[: -len('relative_position_bias_table')] for k in O if k.endswith('relative_position_bias_table')
                  and close(bias_table(O, k[: -len('relative_position_bias_table')], V.shape[2]), V)), None)
        if p:
            hit = bias_table(L, p, V.shape[2]); done['konum'] += 1
    elif V.ndim == 4:
        for k in by_shape.get(V.shape, []):
            W = f32(O[k]).reshape(V.shape[0], -1)
            s = (V.reshape(V.shape[0], -1) * W).sum(1) / np.maximum((W ** 2).sum(1), 1e-30)
            if not close(f32(O[k]) * s[:, None, None, None], V):
                continue
            nz = np.abs(W).max(1) > 0
            bn = next((p for p, bs in bns.items() if bs.shape == s.shape and np.allclose(bs[nz], s[nz], rtol=1e-4)), None)
            if bn is None:
                continue
            fused.append((k[: -len('weight')], bn))
            hit = f32(L[k]) * bn_scale(L, bn)[:, None, None, None]; done['bn-ağırlık'] += 1
            break
    if hit is None and V.ndim == 1:
        for conv, bn in fused:
            b = lambda D: f32(D[conv + 'bias']) if conv + 'bias' in D else 0
            if close((b(O) - f32(O[bn + 'running_mean'])) * bn_scale(O, bn) + f32(O[bn + 'bias']), V):
                hit = (b(L) - f32(L[bn + 'running_mean'])) * bn_scale(L, bn) + f32(L[bn + 'bias']); done['bn-sapma'] += 1
                break
    assert hit is not None and hit.shape == V.shape, f'eşlenemedi: {name} {V.shape}'
    new[name] = hit

for init in m.graph.initializer:
    if init.name in new:
        init.CopyFrom(numpy_helper.from_array(new[init.name], init.name))
print(dict(done))
onnx.save(convert_float_to_float16(m, keep_io_types=True), sys.argv[4])
print('yazıldı', sys.argv[4])
