/**
 * Draws ace-editor Widget on a div
 */
export default class Markdown {

  constructor(text) {
    this.text = text;
    this.text = this.text.replace(/&lt;/g, "<");
    this.text = this.text.replace(/&gt;/g, ">");
    this.text = this.text.replace(/&quot;/g, "\"");
    this.text = this.text.replace(/&#39;/g, "\'");
    this.text = this.text.replace(/&amp;/g, "&");
  }

  getHTML() {
    return DOMPurify.sanitize(marked.parse(this.text));
  }

  getMarkdownDivAsHtml() {
    let mDiv = this.getMarkdownDiv();
    return "<div>" + mDiv.innerHTML + "</div>";
  }

  getMarkdownDiv() {
    let mdDiv = document.createElement('div');
    mdDiv.innerHTML = this.getHTML();
    mdDiv.querySelectorAll('pre code').forEach(el => {
      hljs.highlightElement(el);
    });
    return mdDiv;

  }
}
