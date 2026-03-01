// Type declarations for Vite-specific import query suffixes
declare module '*.css?inline' {
  const css: string;
  export default css;
}
