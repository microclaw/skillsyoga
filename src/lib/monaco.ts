import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Force Monaco to be bundled with the app instead of loaded from a remote CDN.
loader.config({ monaco });

