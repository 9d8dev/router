import { revalidateTag } from "next/cache";

export const publishedFormCacheTag = (publicId: string) =>
  `published-form:${publicId}`;

export function publishedFormEtag(input: {
  publicId: string;
  revision: number;
  showAttribution: boolean;
}): string {
  return `W/"${input.publicId}-${input.revision}-${input.showAttribution ? "attributed" : "unbranded"}"`;
}

export function invalidatePublishedForm(publicId: string): void {
  revalidateTag(publishedFormCacheTag(publicId));
}
