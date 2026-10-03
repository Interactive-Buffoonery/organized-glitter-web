import { pb } from '@/lib/pocketbase';

export const PrivateFilesService = {
  getToken(): Promise<string> {
    return pb.files.getToken();
  },

  getCurrentUserId(): string | undefined {
    return pb.authStore.record?.id;
  },

  getBaseUrl(): string {
    return pb.baseUrl;
  },
};
