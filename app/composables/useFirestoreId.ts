export const useFirestoreId = () => {
  const generate = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map(byte => chars[byte % chars.length])
      .join('')
  }

  return { generate }
}
