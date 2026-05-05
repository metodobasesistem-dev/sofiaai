/**
 * Phone number normalization utility to ensure consistency across the system.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // 1. Remove all non-digits
  let clean = phone.replace(/\D/g, '');
  
  // 2. Handle Brazilian numbers (most common in this app)
  // If it has 10 or 11 digits, it's missing the country code (55)
  if (clean.length === 10 || clean.length === 11) {
    clean = '55' + clean;
  }
  
  // 3. Special case for WhatsApp Brazil 9th digit
  // WhatsApp often removes the 9th digit for some regions or keeps it for others.
  // However, for ID consistency, we usually stick to what the API provides.
  // But if we want to merge 55119... and 5511..., we need deeper logic.
  // For now, just ensuring '55' prefix is a huge step.
  
  return clean;
}

export function getThreadId(userId: string, phone: string): string {
  const normalized = normalizePhone(phone);
  return `${userId}_${normalized}`;
}
