import { revalidateTag } from "next/cache";

export const publishedFormCacheTag = (publicId: string) =>
  `published-form:${publicId}`;

export function invalidatePublishedForm(publicId: string): void {
  revalidateTag(publishedFormCacheTag(publicId));
}
