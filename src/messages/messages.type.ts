export enum EWriteType {
    None = 'None',
    Write = 'Write',
  }
  
  export enum ELineStat {
    Online = 'Online',
    Offline = 'Offline',
  }
  
  export enum EReadIt {
    Readed = 'Readed',
    Unreaded = 'Unreaded',
  }
  
  export enum SendMsgsTcpPatterns {
    UpdatePartner = 'UpdatePartner',
    UpdateMsg = 'UpdateMsg',
    Blocked = 'Blocked'
  }
  
  // Типы сообщений
  export interface Message {
    id: string;
    chatId: string;
    fromUser: string;
    toUser: string;
    text: string;
    created_at: number;
    updated_at: number;
    readStat: EReadIt;
    media_type?: string;
    media_url?: string;
    isDeleted?: boolean;
  }
  
  // Типы ответов API
  export interface MessageResponse {
    id: string;
    chatId: string;
    fromUser: string;
    toUser: string;
    text: string;
    created_at: number;
    updated_at: number;
    readStat: EReadIt;
    media_type?: string;
    media_url?: string;
  }
  
  // Тип статуса пользователя
  export interface UserStatus {
    userId: string;
    lineStatus: ELineStat;
    isWriting: boolean;
  }