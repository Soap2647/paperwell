import { useEffect } from 'react';
import { EditorProvider, useEditor } from './store/editor';
import Landing from './app/Landing';
import Editor from './app/Editor';
import Toaster from './components/Toaster';
import { useLocale } from './i18n';
import { registerCssFonts } from './core/fonts';
import { useTheme } from './app/theme';

function Root() {
    const { state } = useEditor();
    useLocale();
    useTheme();

    useEffect(() => { registerCssFonts(); }, []);

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
