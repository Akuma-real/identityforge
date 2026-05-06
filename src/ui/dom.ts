type AttrValue = string | number | boolean | null | undefined | EventListener;

export function $(sel: string, ctx: ParentNode = document): HTMLElement | null {
  return ctx.querySelector(sel);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, AttrValue>,
  ...children: Array<string | Node | null | undefined>
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') e.className = String(v);
      else if (k === 'innerHTML') e.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (typeof v === 'boolean') {
        if (v) e.setAttribute(k, '');
      } else if (v != null) e.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}
