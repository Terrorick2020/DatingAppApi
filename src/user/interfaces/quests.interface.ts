export interface PlansObj {
    date: string
    content: string
}

export interface QuestItem {
    id: string
    name: string
    age: number
    city: string
    description: string
    plans: PlansObj
    photos: string[]
}
