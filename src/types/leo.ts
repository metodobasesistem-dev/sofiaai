export interface InstagramAccount {
  id: string;
  username: string;
  name: string;
  picture_url: string;
}

export interface InstagramStatus {
  connected: boolean;
  account: InstagramAccount | null;
  expires_at: string | null;
}

export interface QualificationResult {
  score: number;
  interesse: string;
  orcamento: string;
  proximo_passo: string;
  deve_passar_sofia: boolean;
}
