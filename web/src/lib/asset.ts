/**
 * public/ 下的静态资源地址。
 *
 * 不能用 `/xxx.png` 这种绝对路径：应用可能部署在子目录（例如 GitHub Pages 的
 * https://user.github.io/repo/），绝对路径会指到域名根而 404。
 * Vite 的 BASE_URL 在 base:'./' 时是 './'，拼出来就是相对当前文档的地址，
 * 根域名、子目录、Capacitor 的 https://localhost/ 三种情况都成立。
 */
export function asset(name: string) {
  return `${import.meta.env.BASE_URL}${name}`;
}
