import React from 'react';
import { ArrowDownRight, Landmark, Sparkles } from 'lucide-react';
import campusImage from '../../assets/images/ct-college-maqsuda.png';

export default function CampusHero() {
  return (
    <section className="campus-hero" aria-labelledby="campus-hero-title" data-scroll-reveal>
      <div className="campus-hero-copy">
        <span className="campus-kicker"><Sparkles size={14} aria-hidden="true" /> A more connected campus</span>
        <h2 id="campus-hero-title">A brighter way to support every student.</h2>
        <p>Bring attendance, progress, and people together to help your campus notice when a student may need support.</p>
        <div className="campus-hero-note">
          <span className="campus-hero-note-icon"><Landmark size={17} aria-hidden="true" /></span>
          <span><strong>Your campus, in focus</strong><small>Insight for a more supportive school community</small></span>
          <ArrowDownRight className="campus-hero-note-arrow" size={18} aria-hidden="true" />
        </div>
      </div>
      <div className="campus-hero-scene">
        <div className="campus-photo-frame">
          <img
            src={campusImage}
            alt="Illustration of CT Group of Institutions, Maqsuda campus"
          />
        </div>
      </div>
      <div className="campus-hero-orb campus-hero-orb-one" aria-hidden="true" />
      <div className="campus-hero-orb campus-hero-orb-two" aria-hidden="true" />
    </section>
  );
}
