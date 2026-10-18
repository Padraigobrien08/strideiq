/** Inline before paint to avoid theme flash (reads zustand persist key). */
export function ThemeScript() {
  const script = `(function(){try{var raw=localStorage.getItem("strideiq-theme-v1");var parsed=raw&&JSON.parse(raw);var theme=(parsed&&parsed.state&&parsed.state.theme)||"light";var root=document.documentElement;root.classList.remove("light","dark");root.classList.add(theme==="dark"?"dark":"light");root.style.colorScheme=theme==="dark"?"dark":"light";}catch(e){document.documentElement.classList.add("light");}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
