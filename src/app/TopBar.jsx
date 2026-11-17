import {
    PanelLeft, Undo2, Redo2, ZoomIn, ZoomOut, Search, Download, Wrench, Combine, Scissors, Minimize2, Stamp, Hash,
    FileOutput, Info, ScanText, ImageMinus, ScanLine, Layers, Printer, FilePlus2, Keyboard, Moon, Sun, Monitor, Languages, ChevronDown, MoreHorizontal, Ruler, Scaling, SplitSquareHorizontal, Share2, FileImage, FileText, FolderDown, Sparkles, Images,
} from 'lucide-react';
import { useEditor } from '../store/editor';
import { download, exportPng, saveProject, upscaleImageDoc } from '../store/actions';
import { clearRecovery } from './recovery';
import { runMagicLayers } from './magicLayersAction';
import { isDesktop } from '../platform';
import { t, getLocale, setLocale } from '../i18n';
import { Button, IconButton, Menu, Tooltip } from '../components/ui';
import { setTheme, useTheme } from './theme';
import Logo from './Logo';
import SearchBar from './SearchBar';

export default function TopBar({ pagesOpen, onTogglePages }) {
    const ed = useEditor();
    const { state, dispatch } = ed;
    const theme = useTheme();
    const open = (dialog) => dispatch({ type: 'SET', values: { dialog } });
    const setZoom = (z) => dispatch({ type: 'SET', values: { zoom: Math.min(5, Math.max(0.2, z)) } });
    const isImage = state.doc.kind === 'image';

    const closeDoc = () => {
        if (state.dirty && !window.confirm(t('Kaydedilmemiş değişiklikler var') + ' — ' + t('Yeni dosya') + '?')) return;
        clearRecovery();
        dispatch({ type: 'CLOSE' });
    };

    const newDesign = () => {
        if (state.dirty && !window.confirm(t('Kaydedilmemiş değişiklikler var') + ' — ' + t('Yeni tasarım') + '?')) return;
        open('newdesign');
    };

    const toolItems = [
        { header: t('Belge araçları') },
        { label: t('Birleştir'), icon: Combine, onClick: () => open('merge') },
        { label: t('Böl'), icon: Scissors, onClick: () => open('split'), disabled: isImage },
        { label: t('Sıkıştır'), icon: Minimize2, onClick: () => open('compress') },
        { label: t('Filigran'), icon: Stamp, onClick: () => open('watermark') },
        { label: t('Sayfa numaraları'), icon: Hash, onClick: () => open('pagenumbers'), disabled: isImage },
        { label: t('Metin tanıma (OCR)'), icon: ScanText, onClick: () => open('ocr') },
        { label: t('Sihirli Katmanlar'), icon: Layers, onClick: () => runMagicLayers(ed) },
        { label: t('Belge tarayıcı'), icon: ScanLine, onClick: () => open('scan') },
        { label: t('Boyutu değiştir…'), icon: Scaling, onClick: () => open('resize') },
        { label: t('Sosyal medyaya hazırla…'), icon: Share2, onClick: () => open('social') },
        { label: t('Toplu işlem…'), icon: Images, onClick: () => open('batch') },
        { label: t('Arka planı kaldır'), icon: ImageMinus, onClick: () => dispatch({ type: 'SET', values: { dialog: 'bgremove', bgTarget: null } }), disabled: !isImage },
        '-',
        { label: t('Dışa aktar'), icon: FileOutput, onClick: () => open('export') },
        { label: t('Belge bilgileri'), icon: Info, onClick: () => open('properties') },
    ];

    const moreItems = [
        { label: t('Yeni tasarım…'), icon: FilePlus2, onClick: newDesign },
        { label: t('Yeni dosya'), icon: FilePlus2, onClick: closeDoc },
        { label: t('Projeyi kaydet (.paperwell)'), icon: FolderDown, onClick: () => saveProject(ed), shortcut: state.doc.projectPath ? 'Ctrl+S' : undefined },
        { label: t('Projeyi farklı kaydet…'), icon: FolderDown, onClick: () => saveProject(ed, { saveAs: true }) },
        { label: t('Farklı kaydet'), icon: Download, onClick: () => download(ed, { saveAs: true }), shortcut: 'Ctrl+Shift+S' },
        { label: t('Klavye kısayolları'), icon: Keyboard, onClick: () => open('shortcuts'), shortcut: '?' },
        '-',
        { header: t('Tema') },
        { label: t('Açık'), icon: Sun, checked: theme === 'light', onClick: () => setTheme('light') },
        { label: t('Koyu'), icon: Moon, checked: theme === 'dark', onClick: () => setTheme('dark') },
        { label: 'Sistem / System', icon: Monitor, checked: theme === 'system', onClick: () => setTheme('system') },
        '-',
        { header: t('Dil') },
        { label: 'Türkçe', icon: Languages, checked: getLocale() === 'tr', onClick: () => setLocale('tr') },
        { label: 'English', icon: Languages, checked: getLocale() === 'en', onClick: () => setLocale('en') },
    ];

    return (
        <header className="h-14 shrink-0 bg-surface border-b border-line flex items-center gap-2 px-2 relative z-30">
            <IconButton icon={PanelLeft} label={t('Sayfalar')} active={pagesOpen} onClick={onTogglePages} />
            <button onClick={closeDoc} className="flex items-center gap-2 px-1.5 h-9 rounded-lg hover:bg-surface-3" title={t('Yeni dosya')}>
                <Logo className="w-7 h-7" />
            </button>
            <div className="min-w-0 flex flex-col leading-tight mr-2">
                <span className="text-[13px] font-semibold truncate max-w-[28vw]" title={state.doc.name}>
                    {state.doc.name}
                </span>
                <span className="text-[11px] text-fg-3 flex items-center gap-1.5">
                    {state.doc.pages.length} {t('sayfa')}
                    {state.dirty && <span className="inline-flex items-center gap-1 text-warning"><span className="w-1.5 h-1.5 rounded-full bg-warning" />{t('Kaydedilmemiş değişiklikler var')}</span>}
                </span>
            </div>

            <div className="flex items-center gap-0.5 ml-auto md:ml-0">
                <IconButton icon={Undo2} label={t('Geri al')} shortcut="Ctrl+Z" disabled={!state.past.length} onClick={() => dispatch({ type: 'UNDO' })} />
                <IconButton icon={Redo2} label={t('Yinele')} shortcut="Ctrl+Y" disabled={!state.future.length} onClick={() => dispatch({ type: 'REDO' })} />
            </div>

            <div className="hidden md:flex items-center gap-0.5 mx-auto bg-surface-2 border border-line rounded-lg p-0.5">
                <IconButton size="sm" icon={ZoomOut} label={t('Uzaklaştır')} shortcut="Ctrl −" onClick={() => setZoom(state.zoom / 1.2)} />
                <Menu
                    trigger={
                        <button className="h-7 px-2 rounded-md text-xs font-medium tabular-nums hover:bg-surface-3 inline-flex items-center gap-1 min-w-[64px] justify-center">
                            {Math.round(state.zoom * 100)}%<ChevronDown className="w-3 h-3 text-fg-3" />
                        </button>
                    }
                    items={[
                        { label: t('Genişliğe sığdır'), onClick: () => window.dispatchEvent(new CustomEvent('paperwell:fit', { detail: 'width' })), shortcut: 'Ctrl+0' },
                        { label: t('Sayfaya sığdır'), onClick: () => window.dispatchEvent(new CustomEvent('paperwell:fit', { detail: 'page' })) },
                        '-',
                        ...[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((z) => ({ label: `${z * 100}%`, onClick: () => setZoom(z), checked: Math.abs(state.zoom - z) < 0.01 })),
                    ]}
                />
                <IconButton size="sm" icon={ZoomIn} label={t('Yakınlaştır')} shortcut="Ctrl +" onClick={() => setZoom(state.zoom * 1.2)} />
                <IconButton size="sm" icon={Ruler} label={t('Cetveller')} shortcut="Ctrl+R" active={state.rulers} onClick={() => dispatch({ type: 'SET', values: { rulers: !state.rulers } })} />
                {state.dirty && (
                    // basılı tutunca ilk hal görünür, bırakınca son hal
                    <IconButton size="sm" icon={SplitSquareHorizontal} label={t('Önce / sonra (basılı tutun)')} active={!!state.compare}
                        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); dispatch({ type: 'SET', values: { compare: true } }); }}
                        onPointerUp={() => dispatch({ type: 'SET', values: { compare: false } })}
                        onPointerCancel={() => dispatch({ type: 'SET', values: { compare: false } })} />
                )}
            </div>

            <div className="flex items-center gap-1 ml-auto md:ml-0">
                {state.search ? (
                    <SearchBar />
                ) : (
                    <IconButton icon={Search} label={t('Bul ve değiştir')} shortcut="Ctrl+F" onClick={() => dispatch({ type: 'SET', values: { search: { query: '', results: [], index: 0 } } })} />
                )}
                <Menu trigger={<span><Tooltip label={t('Belge araçları')}><Button variant="ghost" icon={Wrench} className="hidden lg:inline-flex">{t('Belge araçları')}</Button></Tooltip><IconButton icon={Wrench} label={t('Belge araçları')} className="lg:hidden" /></span>} items={toolItems} align="right" />
                <IconButton icon={Printer} label={t('Yazdır')} shortcut="Ctrl+P" onClick={() => open('print')} />
                <Menu trigger={<IconButton icon={MoreHorizontal} label="Menu" />} items={moreItems} align="right" />
                <Button variant="primary" icon={Download} onClick={() => download(ed)} className="ml-1">
                    <span className="hidden sm:inline">{isImage ? t('PNG olarak indir') : isDesktop ? t('Kaydet') : t('İndir')}</span>
                </Button>
                <Menu trigger={<IconButton icon={ChevronDown} label={t('Dışa aktar')} size="sm" />} items={[
                    { label: t('Projeyi kaydet (sonra düzenlenebilir)'), icon: FolderDown, onClick: () => saveProject(ed) },
                    '-',
                    ...(isImage ? [
                    { label: t('Yapay zekâyla netleştir (2×), sonra kaydedin'), icon: Sparkles, onClick: () => upscaleImageDoc(ed, 2) },
                    { label: t('Orijinal boyutta kaydet'), icon: FileImage, onClick: () => download(ed) },
                    { label: t('2 kat çözünürlükte kaydet (logolar daha net)'), icon: FileImage, onClick: () => download(ed, { scale: 2 }) },
                ] : [
                    { label: t('PDF olarak indir'), icon: FileText, onClick: () => download(ed) },
                    { label: t('PNG görsel olarak indir'), icon: FileImage, onClick: () => exportPng(ed) },
                ])]} align="right" />
            </div>
        </header>
    );
}
