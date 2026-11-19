"use client";

import { useState } from "react";
import { avatarArt, isStockAvatarSrc } from "@/lib/avatar-art";

type AvatarProps = {
  /** Display name used to generate the default artwork and its fallback. */
  name: string;
  /** Uploaded photo. When missing, generated artwork is shown instead. */
  src?: string | null;
  alt?: string;
  className?: string;
};

/**
 * Renders the uploaded account photo, or a deterministic generated avatar
 * while no photo is set (or if the stored photo can no longer be loaded).
 *
 * The bundled line-art illustrations are drawn facing right, so they are
 * mirrored horizontally to face left. Uploaded photos are never flipped.
 */
export default function Avatar({ name, src, alt = "", className }: AvatarProps) {
  const [failed, setFailed] = useState("");
  const source = src && src !== failed ? src : avatarArt(name);
  const mirrored = isStockAvatarSrc(source);
  const classes = [className, mirrored ? "avatar-mirrored" : ""].filter(Boolean).join(" ");

  return <img className={classes || undefined} src={source} alt={alt} onError={() => setFailed(src ?? "")}/>;
}
