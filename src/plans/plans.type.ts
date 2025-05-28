export interface UserPlans {
    id: number
    createdAt: Date
    updatedAt: Date

    userId: string
    planId: number
    planDescription: string
    regionId: number
    regionnDescription: string
}

export interface EveningPlansItem {
    value: string
    description: string
}

export interface EveningPlans {
    isCurrent: boolean
    remains: number | null
    plan: EveningPlansItem
    location: EveningPlansItem
}
