export interface PsychologistPhoto {
	id: number
	key: string
	tempTgId: string | null
	telegramId: string | null
}

export interface Psychologist {
	id: number
	telegramId: string
	name: string
	about: string
	status: 'Active' | 'Inactive' | 'Blocked'
	createdAt: Date
	updatedAt: Date
	photos: PsychologistPhoto[]
}

export interface PsychologistPreview {
	id: number
	telegramId: string
	name: string
	about: string
	photos: PsychologistPhoto[]
}

export interface PsychologistsListResponse {
	psychologists: PsychologistPreview[]
	total: number
}

export interface CreatePsychologistResponse {
	psychologist: Psychologist
	message: string
}

export interface UpdatePsychologistResponse {
	psychologist: Psychologist
}



 