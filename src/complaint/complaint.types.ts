export enum ComplaintStatus {
	PENDING = 'PENDING',
	UNDER_REVIEW = 'UNDER_REVIEW',
	RESOLVED = 'RESOLVED',
	REJECTED = 'REJECTED',
}

export enum ComplaintType {
	OFFENSIVE_CONTENT = 'OFFENSIVE_CONTENT',
	FAKE_PROFILE = 'FAKE_PROFILE',
	HARASSMENT = 'HARASSMENT',
	INAPPROPRIATE_PHOTO = 'INAPPROPRIATE_PHOTO',
	SPAM = 'SPAM',
	UNDERAGE_USER = 'UNDERAGE_USER',
	OTHER = 'OTHER',
}
 
export enum SendComplaintTcpPatterns {
	CreateComplaint = 'CreateComplaint',
	UpdateComplaint = 'UpdateComplaint',
	ComplaintStatusChanged = 'ComplaintStatusChanged',
}

export interface ComplaintResponse {
	id: string
	status: ComplaintStatus
	type: ComplaintType
	createdAt: number
	fromUserId?: string
	reportedUserId?: string
	description?: string
	reportedContentId?: string
	resolutionNotes?: string
	updatedAt?: number
}

export interface ComplaintStats {
	total: number
	byType: {
		type: string
		label: string
		count: number
	}[]
	byStatus: {
		status: ComplaintStatus
		count: number
	}[]
}

export interface ComplaintFromUser {
	telegramId: string
	name: string
	avatar: string
}

export interface ComplaintWithUsers extends ComplaintResponse {
	fromUser: ComplaintFromUser
	reportedUser: ComplaintFromUser
}
