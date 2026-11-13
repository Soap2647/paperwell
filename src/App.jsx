import { useEffect } from 'react';
import { EditorProvider, useEditor } from './store/editor';
import Landing from './app/Landing';
import Editor from './app/Editor';
import Toaster from './components/Toaster';
import { useLocale } from './i18n';
import { registerCssFonts } from './core/fonts';
import { loadStoredFonts } from './core/fontStore';
import { useTheme } from './app/theme';
import { openFile } from './store/actions';
import { takeOpenedFiles, onOpenFiles, setWindowTitle } from './platform';

function Root() {
    const ed = useEditor();
    const { state } = ed;
    useLocale();
    useTheme();

    useEffect(() => { registerCssFonts(); loadStoredFonts(); }, []);

    // Masaüstü: "Birlikte aç" ile gelen ya da sonradan çift tıklanan dosyalar
    useEffect(() => {
        let off = () => {};
        takeOpenedFiles().then((files) => files[0] && openFile(ed, files[0]));
        onOpenFiles((files) => {
            if (!files[0]) return;
            if (ed.get().dirty && !window.confirm('Kaydedilmemiş değişiklikler kaybolacak. Yeni dosya açılsın mı?')) return;
            openFile(ed, files[0]);
        }).then((fn) => { off = fn; });
        return () => off();
    }, [ed]);

    // Pencere başlığı
    useEffect(() => {
        const name = state.doc?.name;
        setWindowTitle(name ? `${state.dirty ? '• ' : ''}${name} — Paperwell` : 'Paperwell');
    }, [state.doc?.name, state.dirty]);

    // Kaydedilmemiş değişiklik varken sekme kapatılırsa uyar
    useEffect(() => {
        if (!state.dirty) return;
        const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [state.dirty]);

    // Pencereye bırakılan dosya tarayıcıda açılıp uygulamadan çıkılmasın
    useEffect(() => {
        const prevent = (e) => e.preventDefault();
        window.addEventListener('dragover', prevent);
        window.addEventListener('drop', prevent);
        return () => {
            window.removeEventListener('dragover', prevent);
            window.removeEventListener('drop', prevent);
        };
    }, []);

    return (
        <>
            {state.doc ? <Editor /> : <Landing />}
            <Toaster />
        </>
    );
}

export default function App() {
    return (
        <EditorProvider>
            <Root />
        </EditorProvider>
    );
}
