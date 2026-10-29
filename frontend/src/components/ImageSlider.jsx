import React, { useState, useEffect, useContext } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import useLandingContent from '../hooks/useLandingContent';
import campus from '../assets/campus.jpg';
import classroom from '../assets/classroom.jpg';
import dashboard from '../assets/dashboard.jpg';

const ImageSlider = () => {
  const { language } = useContext(LanguageContext);
  const landingContent = useLandingContent();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  const fallbackSlides = [
    {
      id: 1,
      image: campus,
      titleEn: 'Mekdela Amba University',
      titleAm: 'መቅደላ አምባ ዩኒቨርሲቲ',
      alt: 'Mekdela Amba University campus',
    },
    {
      id: 2,
      image: classroom,
      titleEn: 'Instructor Performance Evaluation System',
      titleAm: 'የመምህራን የሥራ አፈጻጸም ግምገማ ሥርዓት',
      alt: 'Modern classroom with dashboard',
    },
    {
      id: 3,
      image: dashboard,
      titleEn: 'Evaluate. Improve. Excel.',
      titleAm: 'ገምግም፣ አሻሽል፣ ውጤታማ ሁን',
      alt: 'System statistics dashboard',
    },
  ];
  const slides = fallbackSlides.map((slide, index) => ({
    ...slide,
    image: landingContent.home_hero_images[index] || slide.image,
  }));

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeOut(true);
      setTimeout(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
        setFadeOut(false);
      }, 400);
    }, 4000);

    return () => clearInterval(interval);
  }, [slides.length]);

  const handlePrevious = () => {
    setFadeOut(true);
    setTimeout(() => {
      setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
      setFadeOut(false);
    }, 400);
  };

  const handleNext = () => {
    setFadeOut(true);
    setTimeout(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
      setFadeOut(false);
    }, 400);
  };

  return (
    <div className="relative w-full h-[400px] md:h-[500px] overflow-hidden rounded-3xl shadow-2xl group bg-gray-900">
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
            index === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={index !== currentSlide}
        >
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0"
            style={{ backgroundImage: `url(${slide.image})` }}
          />
          <div className="absolute inset-0 z-10 bg-black/20" />
        </div>
      ))}

      <div className="absolute inset-0 z-20 flex items-center justify-center px-4 text-center">
        <h2
          className={`text-white text-3xl sm:text-4xl md:text-5xl font-bold leading-tight transition-all duration-500 ${
            fadeOut ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}
        >
          {language === 'en' ? slides[currentSlide].titleEn : slides[currentSlide].titleAm}
        </h2>
      </div>

      <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (i !== currentSlide) {
                setFadeOut(true);
                setTimeout(() => {
                  setCurrentSlide(i);
                  setFadeOut(false);
                }, 400);
              }
            }}
            className={`rounded-full transition-all duration-300 ${
              i === currentSlide ? 'bg-ieps-gold-500 w-8 h-3' : 'bg-white/60 w-3 h-3 hover:bg-white'
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handlePrevious}
        className="absolute left-4 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-white shadow-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100 hover:bg-black/40"
        aria-label="Previous slide"
      >
        <ChevronLeft size={24} />
      </button>

      <button
        type="button"
        onClick={handleNext}
        className="absolute right-4 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-white shadow-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100 hover:bg-black/40"
        aria-label="Next slide"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
};

export default ImageSlider;
