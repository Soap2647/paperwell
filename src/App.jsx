import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Layout, { TAB_TITLES } from './components/Layout';
import FileDropzone from './components/FileDropzone';
import PDFViewer from './components/PDFViewer';
import ImageRemovalTool from './components/ImageRemovalTool';
import ExportTool from './components/ExportTool';
import TextEditTool from './components/TextEditTool';
import PageOrganizer from './components/PageOrganizer';
import AnnotationToolbar, { IconButton } from './components/AnnotationToolbar';
import ShapeTool from './components/ShapeTool';
import SignatureTool from './components/SignatureTool';
import MergeTool from './components/MergeTool';
import SplitTool from './components/SplitTool';
import CompressTool from './components/CompressTool';
import WatermarkTool from './components/WatermarkTool';
import PageNumberTool from './components/PageNumberTool';
import Toaster, { toast } from './components/Toaster';
import { useAnnotations } from './hooks/useAnnotations';
import { embedAnnotationsIntoPdf } from './utils/pdfAnnotationExporter';
import { PDFDocument, degrees } from 'pdf-lib';
import { Download, FileText, FilePlus2, Highlighter, Shapes, PenTool, X, Undo2, Redo2, Type, Eraser, Loader2 } from 'lucide-react';
import './index.css';

const FLOATING_TOOLS = ['annotate', 'shapes', 'edit-text', 'remove-images'];
const MODAL_TOOLS = ['split', 'compress', 'watermark', 'page-number', 'export-image', 'export-word', 'sign'];
const FULL_TOOLS = ['organize', 'merge'];

const FLOATING_META = {
  'annotate': { label: 'İşaretle', icon: Highlighter, cls: 'bg-yellow-500/10 text-yellow-300' },
  'shapes': { label: 'Şekiller', icon: Shapes, cls: 'bg-purple-500/10 text-purple-300' },
  'edit-text': { label: 'Metin', icon: Type, cls: 'bg-cyan-500/10 text-cyan-300' },
  'remove-images': { label: 'Görsel Sil', icon: Eraser, cls: 'bg-emerald-500/10 text-emerald-300' },
};

const loadImageSize = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
  img.onerror = () => resolve({ w: 3, h: 1 });
  img.src = src;
});

function App() {
  const [activeTab, setActiveTab] = useState('view');
  const [pdfFile, setPdfFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfInfo, setPdfInfo] = useState(null);
  const [selection, setSelection] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // PDF değişiklik geçmişi (Undo/Redo) — tek state'te tutulur ki güncellemeler tutarlı olsun
  const [history, setHistory] = useState({ stack: [], index: -1 });
  const pdfData = history.index >= 0 ? history.stack[history.index] : null;
  const canUndoPdf = history.index > 0;
  const canRedoPdf = history.index < history.stack.length - 1;

  // Annotasyon State'leri
  const [tool, setTool] = useState('highlight');
  const [color, setColor] = useState('#FDE047');
  const [lineWidth, setLineWidth] = useState(15);

  // Şekil State'leri
  const [shapeType, setShapeType] = useState('rect');
  const [shapeColor, setShapeColor] = useState('#EF4444');
  const [shapeFillColor, setShapeFillColor] = useState('');
  const [shapeLineWidth, setShapeLineWidth] = useState(3);

  const annotationsManager = useAnnotations();
  const { getPageAnnotations, allPages, clearAll } = annotationsManager;
  const hasAnnotations = Object.values(allPages).some(arr => arr?.length > 0);
  const isDirty = history.index > 0 || hasAnnotations;

  const clearSelectedContent = useCallback(() => {
    setSelectedContent(null);
    setSelection(null);
  }, []);

  const handleFileSelect = useCallback(async (file) => {
    if (!file) return;
    const uint8Array = new Uint8Array(await file.arrayBuffer());
    setPdfFile(file);
    setCurrentPage(1);
    setPdfInfo(null);
    clearSelectedContent();
    clearAll();
    setHistory({ stack: [uint8Array], index: 0 });
  }, [clearAll, clearSelectedContent]);

  const handlePdfLoaded = useCallback((info) => {
    setPdfInfo(info);
  }, []);

  // Yeni PDF sürümünü geçmişe ekler (ileri geçmişini atar)
  const pushPdf = useCallback((newPdfData) => {
    const uint8Array = newPdfData instanceof Uint8Array ? newPdfData : new Uint8Array(newPdfData);
    setHistory(prev => {
      const stack = [...prev.stack.slice(0, prev.index + 1), uint8Array].slice(-30);
      return { stack, index: stack.length - 1 };
    });
    clearSelectedContent();
  }, [clearSelectedContent]);

  const handleUndo = useCallback(() => {
    setHistory(prev => prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
    clearSelectedContent();
  }, [clearSelectedContent]);

  const handleRedo = useCallback(() => {
    setHistory(prev => prev.index < prev.stack.length - 1 ? { ...prev, index: prev.index + 1 } : prev);
    clearSelectedContent();
  }, [clearSelectedContent]);

  const handleDownloadPdf = useCallback(async () => {
    if (!pdfData || downloading) return;

    setDownloading(true);
    try {
      // Çizimleri, şekilleri ve imzaları PDF'e göm
      const modifiedPdfData = await embedAnnotationsIntoPdf(pdfData, allPages, { renderScale: 2 });

      const blob = new Blob([modifiedPdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const baseName = (pdfFile?.name || 'belge.pdf').replace(/\.pdf$/i, '');
      link.download = `${baseName}_duzenlendi.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('PDF indirildi', 'success');
    } catch (err) {
      console.error("İndirme hatası:", err);
      toast('PDF kaydedilirken bir hata oluştu', 'error');
    } finally {
      setDownloading(false);
    }
  }, [pdfData, pdfFile?.name, allPages, downloading]);

  // Sayfa Düzeni Güncelleme (Sıralama, Silme, Döndürme)
  const handlePagesUpdate = useCallback(async (updatedPages) => {
    if (!pdfData) return;

    try {
      const pdfDoc = await PDFDocument.load(pdfData);
      const newPdfDoc = await PDFDocument.create();

      for (const pageInfo of updatedPages) {
        const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageInfo.originalIndex]);
        if (pageInfo.rotation) {
          const currentRotation = copiedPage.getRotation().angle;
          copiedPage.setRotation(degrees((currentRotation + pageInfo.rotation) % 360));
        }
        newPdfDoc.addPage(copiedPage);
      }

      pushPdf(await newPdfDoc.save());

      // Çizimleri yeni sayfa sırasına taşı (döndürülen sayfalardaki çizimler konumunu koruyamayacağı için atlanır)
      if (hasAnnotations) {
        const remapped = {};
        updatedPages.forEach((pageInfo, i) => {
          const anns = allPages[pageInfo.originalIndex + 1];
          if (anns?.length && !pageInfo.rotation) {
            remapped[i + 1] = anns.map(a => ({ ...a, pageNum: i + 1 }));
          }
        });
        annotationsManager.replaceAll(remapped);
      }

      setCurrentPage(1);
      setActiveTab('view');
      toast('Sayfa düzeni uygulandı', 'success');
    } catch (error) {
      console.error("PDF güncellenirken hata:", error);
      toast('PDF sayfaları düzenlenirken bir hata oluştu', 'error');
    }
  }, [pdfData, pushPdf, hasAnnotations, allPages, annotationsManager]);

  const handleReset = useCallback(() => {
    if (isDirty && !window.confirm('Kaydedilmemiş değişiklikler kaybolacak. Yeni dosya açılsın mı?')) return;
    setPdfFile(null);
    setPdfInfo(null);
    setCurrentPage(1);
    clearSelectedContent();
    setHistory({ stack: [], index: -1 });
    clearAll();
    setActiveTab('view');
  }, [isDirty, clearAll, clearSelectedContent]);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(prev => (prev === tab && tab !== 'view' ? 'view' : tab));
    clearSelectedContent();
  }, [clearSelectedContent]);

  const handlePageSelect = useCallback((page) => {
    setCurrentPage(page);
    setSelectedContent(null);
  }, []);

  const handleContentClick = useCallback((content) => {
    setSelectedContent(content);
    if (content) {
      setSelection({
        pageNum: content.pageNum,
        scale: content.scale,
        pageHeight: content.pageHeight,
        pdfCoords: content.pdfCoords,
        detectedBgColor: content.detectedBgColor,
        canvasCoords: { x: content.x, y: content.y, width: content.width, height: content.height },
      });
    }
  }, []);

  const handleSelectionChange = useCallback((sel) => {
    setSelectedContent(null);
    setSelection(sel);
  }, []);

  // Yeni şekil/imzayı sayfanın görünür ortasına yerleştir
  const pageCenter = useCallback((w, h) => {
    const pw = pdfInfo?.pageWidth || 595;
    const ph = pdfInfo?.pageHeight || 842;
    return { x: Math.round(pw / 2 - w / 2), y: Math.round(ph / 3 - h / 2) };
  }, [pdfInfo]);

  const handleAddSignature = useCallback(async (dataUrl) => {
    const { w: iw, h: ih } = await loadImageSize(dataUrl);
    const w = 160;
    const h = Math.max(20, Math.round(w * (ih / iw)));
    annotationsManager.addShape(currentPage, { shapeType: 'image', imageUrl: dataUrl, ...pageCenter(w, h), w, h });
    setActiveTab('shapes');
    toast('İmza eklendi — sürükleyerek konumlandırın', 'success');
  }, [annotationsManager, currentPage, pageCenter]);

  // Klavye kısayolları
  const shortcutRef = useRef();
  shortcutRef.current = { activeTab, annotationsManager, handleUndo, handleRedo, handleDownloadPdf, pdfData };
  useEffect(() => {
    const onKey = (e) => {
      const { activeTab, annotationsManager, handleUndo, handleRedo, handleDownloadPdf, pdfData } = shortcutRef.current;
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      const mod = e.ctrlKey || e.metaKey;
      const annotating = activeTab === 'annotate' || activeTab === 'shapes';

      if (e.key === 'Escape' && !typing && activeTab !== 'view') {
        setActiveTab('view');
        return;
      }
      if (!mod || typing || !pdfData) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        annotating ? annotationsManager.undo() : handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        annotating ? annotationsManager.redo() : handleRedo();
      } else if (key === 's') {
        e.preventDefault();
        handleDownloadPdf();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Kaydedilmemiş değişiklik varken sekme kapatılırsa uyar
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // Sayfa dışına bırakılan dosyalar tarayıcıda açılıp uygulamadan çıkılmasın
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  const contentDetectionMode = activeTab === 'edit-text' ? 'text'
    : activeTab === 'remove-images' ? 'image'
      : null;
  const selectionEnabled = activeTab === 'edit-text' || activeTab === 'remove-images';
  const pageAnnotations = getPageAnnotations(currentPage);
  const closeTool = () => setActiveTab('view');

  const renderLanding = () => (
    <div className="h-full overflow-auto flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <motion.div className="text-center mb-10" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-5xl font-bold text-gradient mb-4">Nebula PDF</h1>
          <p className="text-gray-400 text-lg">
            Görüntüle, işaretle, imzala, düzenle. Dosyalarınız bilgisayarınızdan çıkmaz.
          </p>
        </motion.div>

        <FileDropzone onFileSelect={handleFileSelect} />

        <motion.div className="mt-8 flex flex-wrap justify-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          {['İşaretle', 'Şekil & İmza', 'Metin düzenle', 'Sayfa düzeni', 'Filigran', 'Sayfa no', 'Böl', 'Sıkıştır', 'PNG/JPG', 'Word'].map(f => (
            <span key={f} className="text-xs text-gray-400 px-3 py-1 rounded-full bg-white/5 border border-white/5">{f}</span>
          ))}
        </motion.div>

        <motion.p
          className="mt-8 text-sm text-gray-500 flex items-center justify-center gap-3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        >
          <span className="status-dot online"></span>
          Tüm işlemler tarayıcınızda gerçekleşir
          <span className="text-gray-700">·</span>
          <button onClick={() => setActiveTab('merge')} className="text-purple-300 hover:text-purple-200">PDF birleştir</button>
        </motion.p>
      </div>
    </div>
  );

  const renderFloatingTool = () => {
    const meta = FLOATING_META[activeTab];
    const Icon = meta.icon;
    return (
      <motion.div
        key="floating"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="absolute bottom-5 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      >
        <div className="pointer-events-auto bg-gray-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 pl-3 pr-2 py-2.5 flex items-center gap-3 max-w-5xl w-full">
          <div className={`hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-lg shrink-0 ${meta.cls}`}>
            <Icon className="w-4 h-4" />
            <span className="font-medium text-sm">{meta.label}</span>
          </div>

          <div className="flex-1 min-w-0 flex items-center justify-center">
            {activeTab === 'annotate' && (
              <AnnotationToolbar
                tool={tool}
                setTool={setTool}
                color={color}
                setColor={setColor}
                lineWidth={lineWidth}
                setLineWidth={setLineWidth}
                onUndo={annotationsManager.undo}
                onRedo={annotationsManager.redo}
                onClear={() => annotationsManager.clearPage(currentPage)}
                canUndo={annotationsManager.canUndo}
                canRedo={annotationsManager.canRedo}
              />
            )}

            {activeTab === 'shapes' && (
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <ShapeTool
                  shapeType={shapeType}
                  setShapeType={setShapeType}
                  color={shapeColor}
                  setColor={setShapeColor}
                  fillColor={shapeFillColor}
                  setFillColor={setShapeFillColor}
                  lineWidth={shapeLineWidth}
                  setLineWidth={setShapeLineWidth}
                  onAddShape={() => {
                    const isLine = shapeType === 'line' || shapeType === 'arrow';
                    const w = isLine ? 140 : 120;
                    const h = isLine ? 0 : 80;
                    annotationsManager.addShape(currentPage, {
                      shapeType,
                      ...pageCenter(w, h),
                      w, h,
                      color: shapeColor,
                      fillColor: shapeFillColor,
                      lineWidth: shapeLineWidth
                    });
                  }}
                />
                <div className="w-px h-6 bg-white/10" />
                <div className="flex items-center gap-1">
                  <IconButton onClick={annotationsManager.undo} disabled={!annotationsManager.canUndo} title="Geri Al (Ctrl+Z)"><Undo2 className="w-4 h-4" /></IconButton>
                  <IconButton onClick={annotationsManager.redo} disabled={!annotationsManager.canRedo} title="İleri Al (Ctrl+Y)"><Redo2 className="w-4 h-4" /></IconButton>
                </div>
              </div>
            )}

            {activeTab === 'remove-images' && (
              <ImageRemovalTool
                pdfData={pdfData}
                onPdfUpdate={pushPdf}
                currentPage={currentPage}
                selection={selection}
                selectedContent={selectedContent}
                onClearSelection={clearSelectedContent}
              />
            )}

            {activeTab === 'edit-text' && (
              <TextEditTool
                pdfData={pdfData}
                currentPage={currentPage}
                selection={selection}
                pageHeight={pdfInfo?.pageHeight}
                onPdfUpdate={pushPdf}
                onClearSelection={clearSelectedContent}
                selectedContent={selectedContent}
                onPageSelect={handlePageSelect}
              />
            )}
          </div>

          <button onClick={closeTool} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0" title="Aracı kapat (Esc)" aria-label="Aracı kapat">
            <X className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    );
  };

  const renderModal = () => (
    <motion.div
      key="modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && closeTool()}
    >
      <motion.div
        initial={{ scale: 0.96, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 16, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="bg-gray-900/95 border border-white/10 p-6 rounded-3xl shadow-2xl max-w-xl w-full max-h-full overflow-y-auto custom-scrollbar relative"
        role="dialog"
        aria-label={TAB_TITLES[activeTab]}
      >
        <button onClick={closeTool} className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors z-10" title="Kapat (Esc)" aria-label="Kapat">
          <X className="w-5 h-5" />
        </button>

        {activeTab === 'sign' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2 pr-10">
              <div className="p-2.5 bg-fuchsia-500/20 rounded-xl">
                <PenTool className="w-6 h-6 text-fuchsia-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-100">İmza Oluştur</h3>
                <p className="text-xs text-gray-400">Çizin, yazın veya görsel yükleyin. {currentPage}. sayfaya eklenecek.</p>
              </div>
            </div>
            <SignatureTool onAddSignature={handleAddSignature} />
          </div>
        )}

        {activeTab === 'split' && <SplitTool pdfData={pdfData} pdfInfo={pdfInfo} />}
        {activeTab === 'compress' && <CompressTool pdfData={pdfData} fileName={pdfFile?.name} />}
        {activeTab === 'watermark' && <WatermarkTool pdfData={pdfData} onPdfUpdate={pushPdf} onDone={closeTool} />}
        {activeTab === 'page-number' && <PageNumberTool pdfData={pdfData} onPdfUpdate={pushPdf} onDone={closeTool} />}
        {activeTab === 'export-image' && (
          <ExportTool pdfData={pdfData} currentPage={currentPage} totalPages={pdfInfo?.numPages || 0} exportType="image" />
        )}
        {activeTab === 'export-word' && <ExportTool pdfData={pdfData} exportType="word" />}
      </motion.div>
    </motion.div>
  );

  const renderEditor = () => (
    <div className="h-full relative bg-gray-900/30 rounded-2xl overflow-hidden border border-white/5">
      {FULL_TOOLS.includes(activeTab) ? (
        activeTab === 'organize'
          ? <PageOrganizer pdfSource={pdfData} onPagesUpdate={handlePagesUpdate} />
          : <div className="h-full overflow-y-auto custom-scrollbar"><MergeTool currentPdf={pdfData} currentName={pdfFile?.name} /></div>
      ) : (
        <>
          <PDFViewer
            pdfSource={pdfData}
            currentPage={currentPage}
            onPageSelect={handlePageSelect}
            onPdfLoaded={handlePdfLoaded}
            selectionEnabled={selectionEnabled}
            onSelectionChange={handleSelectionChange}
            selection={selection}
            contentDetectionMode={contentDetectionMode}
            onContentClick={handleContentClick}
            selectedContentId={selectedContent?.id}
            // Annotasyon Props
            annotationMode={activeTab === 'annotate'}
            tool={tool}
            toolColor={color}
            toolWidth={lineWidth}
            annotations={pageAnnotations}
            onAddAnnotation={(points, options) => annotationsManager.addPath(currentPage, points, options)}
            onRemoveAnnotation={(id) => annotationsManager.removeAnnotation(id, currentPage)}
            // Şekil Props
            shapeMode={activeTab === 'shapes'}
            shapes={pageAnnotations.filter(a => a.type === 'shape')}
            onUpdateShape={(id, changes, opts) => annotationsManager.updateAnnotation(id, currentPage, changes, opts)}
            onRemoveShape={(id) => annotationsManager.removeAnnotation(id, currentPage)}
            onBeginShapeChange={annotationsManager.checkpoint}
          />

          <AnimatePresence>
            {FLOATING_TOOLS.includes(activeTab) && renderFloatingTool()}
          </AnimatePresence>

          <AnimatePresence>
            {MODAL_TOOLS.includes(activeTab) && renderModal()}
          </AnimatePresence>
        </>
      )}
    </div>
  );

  const headerLeft = pdfData ? (
    <>
      <div className="p-2 bg-purple-500/15 rounded-lg shrink-0">
        <FileText className="w-5 h-5 text-purple-300" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-100 truncate max-w-[40vw]" title={pdfFile?.name}>
          {pdfFile?.name || 'PDF Dosyası'}
          {isDirty && <span className="ml-2 text-[10px] font-medium text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded align-middle">düzenlendi</span>}
        </p>
        <p className="text-xs text-gray-400">
          {TAB_TITLES[activeTab]} · {pdfInfo?.numPages || 0} sayfa
        </p>
      </div>
    </>
  ) : activeTab === 'merge' ? (
    <h2 className="text-lg font-semibold text-gray-200">{TAB_TITLES.merge}</h2>
  ) : null;

  const headerActions = pdfData ? (
    <>
      <div className="flex gap-0.5 bg-white/5 p-1 rounded-xl border border-white/5">
        <IconButton onClick={handleUndo} disabled={!canUndoPdf} title="Belge değişikliğini geri al (Ctrl+Z)"><Undo2 className="w-4 h-4" /></IconButton>
        <IconButton onClick={handleRedo} disabled={!canRedoPdf} title="İleri al (Ctrl+Y)"><Redo2 className="w-4 h-4" /></IconButton>
      </div>
      <button
        onClick={handleReset}
        className="px-3 py-2 text-gray-300 rounded-xl hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-medium"
        title="Başka bir PDF aç"
      >
        <FilePlus2 className="w-4 h-4" />
        <span className="hidden md:inline">Yeni Dosya</span>
      </button>
      <button
        onClick={handleDownloadPdf}
        disabled={downloading}
        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 rounded-xl transition-colors flex items-center gap-2 text-sm font-semibold shadow-lg shadow-emerald-500/20 disabled:opacity-60"
        title="Düzenlenmiş PDF'i indir (Ctrl+S)"
      >
        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        İndir
      </button>
    </>
  ) : activeTab === 'merge' ? (
    <button onClick={() => setActiveTab('view')} className="px-3 py-2 text-gray-300 rounded-xl hover:bg-white/10 text-sm">Geri</button>
  ) : null;

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      hasDocument={Boolean(pdfData)}
      headerLeft={headerLeft}
      headerActions={headerActions}
    >
      {pdfData
        ? renderEditor()
        : activeTab === 'merge'
          ? <div className="h-full overflow-y-auto custom-scrollbar bg-gray-900/30 rounded-2xl border border-white/5"><MergeTool /></div>
          : renderLanding()}
      <Toaster />
    </Layout>
  );
}

export default App;
