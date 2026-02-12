import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Timestamp } from 'firebase/firestore'

/**
 * Composable pour formater les dates avec date-fns en français
 * Équivalent aux pipes Angular pour le formatage de dates
 */
export const useDateFormat = () => {
  /**
   * Formate un Timestamp Firestore ou une Date en français
   * @param timestamp - Timestamp Firestore ou Date
   * @param formatPattern - Pattern de formatage date-fns (par défaut: "dd/MM/yyyy 'à' HH:mm")
   * @returns Date formatée en français
   */
  const formatDate = (timestamp: Timestamp | Date | null | undefined, formatPattern: string = "dd/MM/yyyy 'à' HH:mm"): string => {
    if (!timestamp) return ''
    
    const date = timestamp instanceof Date 
      ? timestamp 
      : (timestamp as Timestamp).toDate ? (timestamp as Timestamp).toDate() : new Date(timestamp as any)
    
    return format(date, formatPattern, { locale: fr })
  }

  /**
   * Formate uniquement la date (sans l'heure)
   */
  const formatDateOnly = (timestamp: Timestamp | Date | null | undefined): string => {
    return formatDate(timestamp, 'dd/MM/yyyy')
  }

  /**
   * Formate uniquement l'heure
   */
  const formatTimeOnly = (timestamp: Timestamp | Date | null | undefined): string => {
    return formatDate(timestamp, 'HH:mm')
  }

  /**
   * Formate avec une date relative (ex: "il y a 2 heures")
   */
  const formatRelative = (timestamp: Timestamp | Date | null | undefined): string => {
    if (!timestamp) return ''
    
    const date = timestamp instanceof Date 
      ? timestamp 
      : (timestamp as Timestamp).toDate ? (timestamp as Timestamp).toDate() : new Date(timestamp as any)
    
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) return 'à l\'instant'
    if (diffInSeconds < 3600) return `il y a ${Math.floor(diffInSeconds / 60)} min`
    if (diffInSeconds < 86400) return `il y a ${Math.floor(diffInSeconds / 3600)} h`
    if (diffInSeconds < 604800) return `il y a ${Math.floor(diffInSeconds / 86400)} j`
    
    return formatDate(timestamp)
  }

  return {
    formatDate,
    formatDateOnly,
    formatTimeOnly,
    formatRelative
  }
}
