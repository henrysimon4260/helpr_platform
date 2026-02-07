export interface AttachmentAsset {
  uri: string;
  type: 'photo' | 'video';
  name: string;
}

export interface AttachmentThumbnailsProps {
  attachments: AttachmentAsset[];
  onRemove: (index: number) => void;
  onAdd: () => void;
  showAddLabel?: boolean;
}






