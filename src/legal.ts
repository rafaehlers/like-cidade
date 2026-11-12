export const LEGAL_VERSION = '2026-11-12';
export const LEGAL_CONTACT = { controller: 'Rafael de Menezes Ehlers', email: 'rafaehlers@gmail.com' };
export const LEGAL_LINKS = [
  { href: '/termos', label: 'Termos de uso' },
  { href: '/privacidade', label: 'Política de privacidade' },
  { href: '/cookies', label: 'Cookies e armazenamento' },
] as const;
export const privacyMailto = (subject = 'Privacidade e dados — Like Cidade') => `mailto:${LEGAL_CONTACT.email}?${new URLSearchParams({ subject }).toString()}`;
export type PrivacyCapabilities = { verified: boolean; accountId?: string; canExport: boolean; canDelete: boolean; reason?: string };
export type DeletionReceipt = { receiptId: string; completedAt: string };
