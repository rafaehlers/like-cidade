import { LEGAL_LINKS } from '../legal';

export default function LegalLinks() {
  return <nav className="legal-links" aria-label="Informações legais">{LEGAL_LINKS.map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}<span className="sr-only"> (abre em outra aba)</span></a>)}</nav>;
}
