export interface InstagramAccount {
  id: string;
  username: string;
  name: string;
  picture_url: string;
  followers_count?: number;
  media_count?: number;
}

export interface InstagramStatus {
  connected: boolean;
  account: InstagramAccount | null;
  expires_at: string | null;
  settings?: {
    insta_auto_follow_enabled: boolean;
    insta_auto_follow_msg: string;
    insta_auto_comment_enabled: boolean;
    insta_auto_comment_msg: string;
  };
}

export interface QualificationResult {
  score: number;
  interesse: string;
  orcamento: string;
  resposta_usuario?: string;
  proximo_passo?: string;
  deve_passar_sofia: boolean;
}
