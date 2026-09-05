import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"
import styles from "./NotesWorkspace.module.css"

interface MarkdownViewProps {
  markdown: string
}

export function MarkdownView({ markdown }: MarkdownViewProps) {
  return (
    <article className={styles.markdownView} aria-label="Markdown 阅读内容">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url, key) => key === "src" ? "" : defaultUrlTransform(url)}
        components={{
          img: ({ alt }) => <span className={styles.blockedImage}>图片“{alt || "未命名"}”已阻止加载</span>,
          a: ({ children, ...props }) => <a {...props} rel="noreferrer noopener" target="_blank">{children}</a>,
        }}
      >
        {markdown || "还没有正文。切换到编辑模式开始记录。"}
      </ReactMarkdown>
    </article>
  )
}
