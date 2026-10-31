import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollRevealObserver() {
  const location = useLocation();

  useEffect(() => {
    const elements = document.querySelectorAll('[data-scroll-reveal]');
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });

    const observeElements = () => {
      document.querySelectorAll('[data-scroll-reveal]:not(.scroll-reveal)').forEach((element, index) => {
        element.classList.add('scroll-reveal');
        element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 70}ms`);
        observer.observe(element);
      });
    };
    const mutations = new MutationObserver(observeElements);
    observeElements();
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [location.pathname]);

  return null;
}
