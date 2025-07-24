export interface Psychologist {
  id: number
  telegramId: string
  name: string
  about: string
  status: 'Active' | 'Inactive' | 'Blocked'
  createdAt: Date
  updatedAt: Date
  photos?: PsychologistPhoto[]
}

export interface PsychologistPhoto {
  id: number
  key: string
  tempTgId?: string
  telegramId?: string
  createdAt: Date
}

export interface PsychologistPreview {
  id: number
  telegramId: string
  name: string
  about: string
  avatarKey?: string
  avatarUrl?: string
  createdAt: Date
}

export interface CreatePsychologistResponse {
  psychologist: Psychologist
  message: string
}

export interface PsychologistsListResponse {
  psychologists: PsychologistPreview[]
  total: number
  message: string
} 