export interface FeedItem {
  id: string;
  projectId: number;
  projectName: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  takenAt: string | null;
  createdAt: string | null;
  uploaderName: string | null;
  locationName: string | null;
  description: string | null;
  commentText: string | null;
}

export interface FeedResponse {
  meta: {
    fetchedAt: string;
    totalItems: number;
    projectsScanned: number;
  };
  data: FeedItem[];
}
