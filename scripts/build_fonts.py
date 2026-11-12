# Sihirli Katmanlar'ın font eşleştirmesi ve metin nesneleri için açık lisanslı (OFL / Apache-2.0) Google Fonts paketi.
# google/fonts deposunun sabit bir sürümünden (GFONTS_COMMIT) aileleri alır; her aile için 400/500/600/700 ağırlıklarından
# bulunanların statik örneğini üretir (değişken fontlarda fontTools instancer), Latin + Türkçe karakterlere kırpar.
# Çıktı: public/fonts/g/<Dosya>-Regular|Medium|SemiBold|Bold.ttf, lisans metinleri public/fonts/g/licenses/, src/core/fontCatalog.js
#
#   git clone --filter=blob:none --no-checkout https://github.com/google/fonts.git gfonts
#   (gfonts içinde) git sparse-checkout set <aşağıdaki klasörler>; git checkout <GFONTS_COMMIT>
#   python -I scripts/build_fonts.py <gfonts klasörü>
import json, os, sys, glob, shutil
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

GFONTS_COMMIT = '35e77c3854970a550d9894a85aba21420813a019'
# anahtar, klasör, etiket, tür (sans / serif / display / script / mono)
FAMILIES = [
    ('inter', 'ofl/inter', 'Inter', 'sans'), ('roboto', 'ofl/roboto', 'Roboto', 'sans'), ('opensans', 'ofl/opensans', 'Open Sans', 'sans'),
    ('montserrat', 'ofl/montserrat', 'Montserrat', 'sans'), ('poppins', 'ofl/poppins', 'Poppins', 'sans'), ('lato', 'ofl/lato', 'Lato', 'sans'),
    ('raleway', 'ofl/raleway', 'Raleway', 'sans'), ('nunito', 'ofl/nunito', 'Nunito', 'sans'), ('worksans', 'ofl/worksans', 'Work Sans', 'sans'),
    ('dmsans', 'ofl/dmsans', 'DM Sans', 'sans'), ('manrope', 'ofl/manrope', 'Manrope', 'sans'), ('outfit', 'ofl/outfit', 'Outfit', 'sans'),
    ('plusjakartasans', 'ofl/plusjakartasans', 'Plus Jakarta Sans', 'sans'), ('figtree', 'ofl/figtree', 'Figtree', 'sans'),
    ('hankengrotesk', 'ofl/hankengrotesk', 'Hanken Grotesk', 'sans'), ('spacegrotesk', 'ofl/spacegrotesk', 'Space Grotesk', 'sans'),
    ('archivo', 'ofl/archivo', 'Archivo', 'sans'), ('rubik', 'ofl/rubik', 'Rubik', 'sans'), ('kanit', 'ofl/kanit', 'Kanit', 'sans'),
    ('josefinsans', 'ofl/josefinsans', 'Josefin Sans', 'sans'), ('lexend', 'ofl/lexend', 'Lexend', 'sans'), ('sora', 'ofl/sora', 'Sora', 'sans'),
    ('urbanist', 'ofl/urbanist', 'Urbanist', 'sans'), ('leaguespartan', 'ofl/leaguespartan', 'League Spartan', 'sans'),
    ('exo2', 'ofl/exo2', 'Exo 2', 'sans'), ('titilliumweb', 'ofl/titilliumweb', 'Titillium Web', 'sans'), ('barlow', 'ofl/barlow', 'Barlow', 'sans'),
    ('barlowcondensed', 'ofl/barlowcondensed', 'Barlow Condensed', 'sans'), ('oswald', 'ofl/oswald', 'Oswald', 'sans'),
    ('fredoka', 'ofl/fredoka', 'Fredoka', 'sans'), ('notosans', 'ofl/notosans', 'Noto Sans', 'sans'),
    ('archivoblack', 'ofl/archivoblack', 'Archivo Black', 'display'), ('anton', 'ofl/anton', 'Anton', 'display'),
    ('bebasneue', 'ofl/bebasneue', 'Bebas Neue', 'display'), ('bangers', 'ofl/bangers', 'Bangers', 'display'), ('lobster', 'ofl/lobster', 'Lobster', 'display'),
    ('playfairdisplay', 'ofl/playfairdisplay', 'Playfair Display', 'serif'), ('merriweather', 'ofl/merriweather', 'Merriweather', 'serif'),
    ('lora', 'ofl/lora', 'Lora', 'serif'), ('sourceserif4', 'ofl/sourceserif4', 'Source Serif 4', 'serif'), ('robotoslab', 'apache/robotoslab', 'Roboto Slab', 'serif'),
    ('caveat', 'ofl/caveat', 'Caveat', 'script'), ('permanentmarker', 'apache/permanentmarker', 'Permanent Marker', 'script'),
    ('pacifico', 'ofl/pacifico', 'Pacifico', 'script'), ('dancingscript', 'ofl/dancingscript', 'Dancing Script', 'script'),
    ('spacemono', 'ofl/spacemono', 'Space Mono', 'mono'), ('jetbrainsmono', 'ofl/jetbrainsmono', 'JetBrains Mono', 'mono'),
    ('robotomono', 'ofl/robotomono', 'Roboto Mono', 'mono'),
]
# Latin + Latin-1 + Latin Genişletilmiş-A (ğ ş ı İ) + genel noktalama + para birimleri (₺ €)
WEIGHTS = {400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold'}
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + list(range(0x2010, 0x2040)) + [0x20AC, 0x20BA, 0x2122]

src_root = sys.argv[1]
repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out_dir = os.path.join(repo, 'public', 'fonts', 'g')
lic_dir = os.path.join(out_dir, 'licenses')
os.makedirs(lic_dir, exist_ok=True)


def static_file(folder, style):
    p = glob.glob(os.path.join(folder, f'*-{style}.ttf'))
    return p[0] if p else None


def variable_file(folder):
    p = [f for f in glob.glob(os.path.join(folder, '*[[]*.ttf')) if 'Italic' not in os.path.basename(f)]
    return p[0] if p else None


def make(folder, weight):
    style = WEIGHTS[weight]
    path = static_file(folder, style)
    if path:
        font = TTFont(path)
    else:
        vf = variable_file(folder)
        if not vf:
            return None
        font = TTFont(vf)
        axes = {a.axisTag: a for a in font['fvar'].axes}
        if weight < axes['wght'].minValue or weight > axes['wght'].maxValue:
            return None
        loc = {'wght': weight}
        if 'wdth' in axes: loc['wdth'] = 100
        if 'opsz' in axes: loc['opsz'] = axes['opsz'].defaultValue
        font = instancer.instantiateVariableFont(font, loc, updateFontNames=False)
    opts = subset.Options()
    opts.layout_features = ['kern', 'liga', 'clig', 'calt', 'locl', 'mark', 'mkmk']
    opts.name_IDs = list(range(26))
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    return font


catalog = {}
total = 0
for key, rel, label, kind in FAMILIES:
    folder = os.path.join(src_root, rel)
    file = label.replace(' ', '')
    weights = []
    for w in WEIGHTS:
        f = make(folder, w)
        if f is None:
            continue
        name = f'{file}-{WEIGHTS[w]}.ttf'
        f.recalcTimestamp = False  # deterministik: aynı kaynaktan aynı bayt (git'te gereksiz değişiklik olmasın)
        f.save(os.path.join(out_dir, name))
        total += os.path.getsize(os.path.join(out_dir, name))
        weights.append(w)
    lic = next((p for p in (os.path.join(folder, 'OFL.txt'), os.path.join(folder, 'LICENSE.txt')) if os.path.exists(p)), None)
    assert lic, f'lisans yok: {rel}'
    shutil.copy(lic, os.path.join(lic_dir, f'{file}.txt'))
    catalog[key] = {'label': label, 'file': file, 'kind': kind, 'weights': weights}
    print(f'{label:20s} {weights}')

with open(os.path.join(repo, 'src', 'core', 'fontCatalog.js'), 'w', encoding='utf-8', newline='\n') as fh:
    fh.write('// scripts/build_fonts.py tarafından üretildi (google/fonts @ ' + GFONTS_COMMIT[:12] + '); elle düzenlemeyin.\n')
    fh.write('// Açık lisanslı (OFL / Apache-2.0) aileler; dosyalar public/fonts/g/, lisanslar public/fonts/g/licenses/.\n')
    fh.write('export const FONT_CATALOG = ' + json.dumps(catalog, ensure_ascii=False, indent=4) + ';\n')
print(f'{len(catalog)} aile, {total / 1e6:.1f} MB')
