declare function GM_getValue<T = unknown>(key: string, defaultValue?: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_addStyle(css: string): void;
declare function GM_openInTab(url: string, options?: { active?: boolean }): void;
declare function GM_setClipboard(text: string, type?: string): void;

interface GMXmlHttpResponse {
  status: number;
  responseText: string;
}

interface GMXmlHttpRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  onload?: (response: GMXmlHttpResponse) => void;
  onerror?: () => void;
  ontimeout?: () => void;
}

declare function GM_xmlhttpRequest(options: GMXmlHttpRequestOptions): void;
