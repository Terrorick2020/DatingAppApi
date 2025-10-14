export enum ComplaintStatus {
	PENDING = 'PENDING',
	UNDER_REVIEW = 'UNDER_REVIEW',
	RESOLVED = 'RESOLVED',
	REJECTED = 'REJECTED',
}

export enum ComplaintType {
	FAKE_ISPOLZUET_MOI_DANNYE = 'fake, ispolzuet_moi_dannye',
	FAKE_ISPOLZUET_DANNYE_MOEGO_ZNAKOMOGO = 'fake, ispolzuet_dannye_moego_znakomogo',
	FAKE_ISPOLZUET_DANNYE_IZVESTNOGO_CHELOVEKA = 'fake, ispolzuet_dannye_izvestnogo_cheloveka',
	FAKE_VEDET_SEBYA_KAK_ROBOT = 'fake, vedet_sebya_kak_robot',
	FAKE_NICHEGO_NE_RASSKAZYVAET_O_SEBE = 'fake, nichego_ne_rasskazyvaet_o_sebe',
	FAKE_DRUGOE_FAKE = 'fake, drugoe_fake',

	INAPPROPRIATE_CONTENT_NEPRIEMLEMYE_FOTOGRAFII = 'inappropriate_content, nepriemlemye_fotografii',
	INAPPROPRIATE_CONTENT_NEPRIEMLEMIY_TEKST = 'inappropriate_content, nepriemlemiy_tekst',
	INAPPROPRIATE_CONTENT_DRUGOE_CONTENT = 'inappropriate_content, drugoe_content',

	AGE_VYGLYADIT_MLADSHE_18 = 'age, vygladit_mladshe_18',
	AGE_GOVORIT_CHTO_MLADSHE_18 = 'age, govorit_chto_mladshe_18',
	AGE_ZNAYU_CHTO_MLADSHE_18 = 'age, znayu_chto_mladshe_18',
	AGE_DRUGOE_AGE = 'age, drugoe_age',

	INSULTS_RASIZM = 'insults, rasizm',
	INSULTS_BULLING = 'insults, bulling',
	INSULTS_SEKSIZM = 'insults, seksizm',
	INSULTS_BODISHEYIMING = 'insults, bodisheyiming',
	INSULTS_SLATSHEIMING = 'insults, slatsheiming',
	INSULTS_DRUGOE_ABUSE = 'insults, drugoe_abuse',

	BEHAVIORS_OUT_TOGETHER_NEGATIVNIY_OPYT_NA_SVIDANII = 'behaviors_out_together, negativniy_opyt_na_svidanii',
	BEHAVIORS_OUT_TOGETHER_FIZICHESKOE_NASILIE = 'behaviors_out_together, fizicheskoe_nasilie',
	BEHAVIORS_OUT_TOGETHER_PSIKHOLOGICHESKOE_NASILIE = 'behaviors_out_together, psikhologicheskoe_nasilie',
	BEHAVIORS_OUT_TOGETHER_SEKSUALIZIROVANNOE_NASILIE = 'behaviors_out_together, seksualizirovannoe_nasilie',
	BEHAVIORS_OUT_TOGETHER_ZHALOBA_NA_ZNAKOMOGO = 'behaviors_out_together, zhaloba_na_znakomogo',

	FRAUD_OR_SPAM_SPAM_I_SYLKI = 'fraud_or_spam, spam_i_sylki',
	FRAUD_OR_SPAM_PRODAZHA_TOVAROV_I_USLUG = 'fraud_or_spam, prodazha_tovarov_i_uslug',
	FRAUD_OR_SPAM_REKLAMA_AKKAUNTOV = 'fraud_or_spam, reklama_akkauntov',
	FRAUD_OR_SPAM_DRUGOE_SCAM = 'fraud_or_spam, drugoe_scam',

	// Support
	SUPPORT_QUESTION = 'support, question',
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
