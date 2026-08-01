import { useLayoutEffect, useRef } from 'react';
import certificateTemplateUrl from '../../Brand/certificate/cbda-certificate-template.png';
import type { LmsLearnerProfile } from '../data/types';

interface CertificateArtworkProps {
  profile: LmsLearnerProfile;
  completionDate: string;
  expirationDate: string;
}

export function certificateLearnerName(profile: LmsLearnerProfile) {
  const structuredName = [profile.first_name, profile.middle_name, profile.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return structuredName || profile.display_name.trim() || 'Learner';
}

/**
 * Keeps the live name on one line at every certificate size. The maximum
 * type size scales from the artwork width; measured overflow then keeps
 * shrinking the type until the complete name fits inside the zone.
 */
function useSingleLineNameFit(name: string) {
  const nameRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const nameNode = nameRef.current;
    const zone = nameNode?.parentElement;
    const artwork = nameNode?.closest<HTMLElement>('.certificate-artwork');
    if (!nameNode || !zone || !artwork) return;

    const fitName = () => {
      const availableWidth = zone.clientWidth;
      const artworkWidth = artwork.clientWidth;
      if (availableWidth <= 0 || artworkWidth <= 0) return;

      const targetWidth = availableWidth - Math.max(2, artworkWidth * 0.002);
      const maximum = artworkWidth * 0.052;
      let candidate = maximum;
      nameNode.style.fontSize = `${candidate}px`;

      while (nameNode.scrollWidth > targetWidth) {
        const measuredWidth = nameNode.scrollWidth;
        const shrinkRatio = targetWidth / measuredWidth;
        candidate *= Math.min(0.95, shrinkRatio);
        nameNode.style.fontSize = `${candidate}px`;
      }

      nameNode.dataset.fitStatus = 'fit';
    };

    fitName();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(fitName);
    observer?.observe(artwork);
    window.addEventListener('resize', fitName);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fitName);
    };
  }, [name]);

  return nameRef;
}

export function CertificateArtwork({
  profile,
  completionDate,
  expirationDate,
}: CertificateArtworkProps) {
  const learnerName = certificateLearnerName(profile);
  const nameRef = useSingleLineNameFit(learnerName);

  return (
    <article
      className="certificate-artwork"
      aria-label={`CBDA certificate for ${learnerName}. Completed ${completionDate}. Expires ${expirationDate}.`}
    >
      <img
        className="certificate-template"
        src={certificateTemplateUrl}
        alt=""
        aria-hidden="true"
      />
      <div className="certificate-name-zone">
        <span ref={nameRef} className="certificate-name" data-auto-fit="single-line">
          {learnerName}
        </span>
      </div>
      <p className="certificate-date certificate-completion-date">{completionDate}</p>
      <p className="certificate-date certificate-expiration-date">{expirationDate}</p>
    </article>
  );
}
