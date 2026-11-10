import Sidebar from './Sidebar';

// eslint-disable-next-line react-refresh/only-export-components
export const TAB_TITLES = {
    'view': 'Görüntüle',
    'organize': 'Sayfa Düzeni',
    'annotate': 'İşaretle',
    'shapes': 'Şekiller',
    'edit-text': 'Metin Düzenleme',
    'remove-images': 'Görsel Silme',
    'sign': 'İmza',
    'merge': 'PDF Birleştir',
    'split': 'PDF Böl',
    'compress': 'Sıkıştır',
    'watermark': 'Filigran',
    'page-number': 'Sayfa Numarası',
    'export-image': 'Görsel Olarak Dışa Aktar',
    'export-word': 'Word\'e Dönüştür',
};

/**
 * Layout - Ana uygulama iskelet yapısı
 * @param {React.ReactNode} props.headerLeft - Başlık alanının sol tarafı (dosya bilgisi)
 * @param {React.ReactNode} props.headerActions - Başlık alanının sağ tarafı (eylemler)
 */
export default function Layout({ children, activeTab, onTabChange, hasDocument, headerLeft, headerActions }) {
    return (
        <div className="flex h-screen w-full overflow-hidden grid-pattern">
            <Sidebar activeTab={activeTab} onTabChange={onTabChange} hasDocument={hasDocument} />

            <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <header className="h-16 shrink-0 glass flex items-center justify-between gap-4 px-5 mx-4 mt-4">
                    <div className="flex items-center gap-3 min-w-0">
                        {headerLeft ?? (
                            <h2 className="text-lg font-semibold text-gray-200">Nebula PDF</h2>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {headerActions ?? <StatusIndicator />}
                    </div>
                </header>

                <div className="flex-1 min-h-0 p-4">
                    {children}
                </div>
            </main>
        </div>
    );
}

function StatusIndicator() {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full" title="Dosyalarınız hiçbir sunucuya yüklenmez">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            <span className="text-xs text-emerald-400 font-medium">Yerel Mod</span>
        </div>
    );
}
