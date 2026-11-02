// A legal page as the client supplied it: headings, paragraphs, lists and the contact address.
export type LegalBlock =
  | { t: "h2" | "h3" | "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "address"; lines: string[] };

export type LegalDoc = {
  title: string;
  updated: string;
  notice: string;
  blocks: LegalBlock[];
};
