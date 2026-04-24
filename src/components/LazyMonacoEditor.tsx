import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { editor as MonacoEditor } from "monaco-editor";

// Bind the locally-bundled monaco-editor so `@monaco-editor/react` doesn't
// try to fetch monaco from a CDN. This file is code-split via React.lazy,
// so the ~5MB monaco bundle only downloads when the editor dialog is
// actually opened.
loader.config({ monaco });

export type MonacoCodeEditor = MonacoEditor.IStandaloneCodeEditor;

interface LazyMonacoEditorProps {
  value: string;
  path: string;
  language: string;
  theme?: string;
  className?: string;
  options?: MonacoEditor.IStandaloneEditorConstructionOptions;
  onMount?: (editor: MonacoCodeEditor) => void;
  onChange?: (value: string | undefined) => void;
}

export default function LazyMonacoEditor(props: LazyMonacoEditorProps) {
  return (
    <Editor
      value={props.value}
      path={props.path}
      language={props.language}
      theme={props.theme ?? "vs-dark"}
      className={props.className}
      options={props.options}
      onMount={props.onMount}
      onChange={props.onChange}
    />
  );
}
