"use client";

import Image from "next/image";
import { type PointerEvent, useEffect, useRef, useState } from "react";

type Project = {
  title: string;
  type: string;
  images: string[];
  description: string;
};

type ProjectSliderProps = {
  projects: Project[];
};

export default function ProjectSlider({ projects }: ProjectSliderProps) {
  const [activeProjectIndex, setActiveProjectIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const activeProject = projects[activeProjectIndex];
  const shouldRenderImage = (index: number) => {
    const lastIndex = activeProject.images.length - 1;
    const previousIndex = activeImageIndex === 0 ? lastIndex : activeImageIndex - 1;
    const nextIndex = activeImageIndex === lastIndex ? 0 : activeImageIndex + 1;

    return index === activeImageIndex || index === previousIndex || index === nextIndex;
  };

  useEffect(() => {
    const nextIndex =
      activeImageIndex === activeProject.images.length - 1 ? 0 : activeImageIndex + 1;
    const nextImage = new window.Image();
    nextImage.src = activeProject.images[nextIndex];
  }, [activeImageIndex, activeProject.images]);

  const setProject = (index: number) => {
    setActiveProjectIndex(index);
    setActiveImageIndex(0);
    setDragOffset(0);
  };

  const goToPrevious = () => {
    setDragOffset(0);
    setActiveImageIndex((currentIndex) =>
      currentIndex === 0 ? activeProject.images.length - 1 : currentIndex - 1,
    );
  };

  const goToNext = () => {
    setDragOffset(0);
    setActiveImageIndex((currentIndex) =>
      currentIndex === activeProject.images.length - 1 ? 0 : currentIndex + 1,
    );
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStartX.current = event.clientX;
    setDragOffset(0);
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || dragStartX.current === null) {
      return;
    }

    setDragOffset(event.clientX - dragStartX.current);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) {
      return;
    }

    const dragDistance = event.clientX - dragStartX.current;
    const minimumDragDistance = 48;

    if (Math.abs(dragDistance) >= minimumDragDistance) {
      if (dragDistance < 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }

    dragStartX.current = null;
    setDragOffset(0);
    setIsDragging(false);
  };

  const handlePointerCancel = () => {
    dragStartX.current = null;
    setDragOffset(0);
    setIsDragging(false);
  };

  return (
    <div className="mt-12 w-full max-w-full overflow-hidden bg-neutral-950 text-white lg:mt-14">
      <div className="grid min-w-0 gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className={`relative min-h-[22rem] touch-pan-y select-none overflow-hidden bg-neutral-900 sm:min-h-[30rem] lg:min-h-[42rem] ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <div
            className={`absolute inset-0 flex ${isDragging ? "" : "transition-transform duration-500 ease-out"}`}
            style={{
              transform: `translateX(calc(-${activeImageIndex * 100}% + ${dragOffset}px))`,
            }}
          >
            {activeProject.images.map((image, index) => (
              <div key={image} className="relative h-full min-w-0 shrink-0 basis-full">
                {shouldRenderImage(index) && (
                  <Image
                    src={image}
                    alt={`${activeProject.title} ${index + 1}`}
                    fill
                    sizes="(min-width: 1024px) 58vw, (min-width: 640px) 92vw, 100vw"
                    className="pointer-events-none object-cover object-top"
                    priority={activeProjectIndex === 0 && index === 0}
                    loading={activeProjectIndex === 0 && index === 0 ? "eager" : "lazy"}
                    draggable={false}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <div className="absolute bottom-5 left-5 rounded-full bg-black/78 px-4 py-2 text-sm font-semibold backdrop-blur">
            {String(activeImageIndex + 1).padStart(2, "0")} /{" "}
            {String(activeProject.images.length).padStart(2, "0")}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between p-6 sm:p-8 lg:p-10">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/42">
              {activeProject.type}
            </p>
            <h3 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
              {activeProject.title}
            </h3>
            <p className="mt-5 leading-7 text-white/62">{activeProject.description}</p>
          </div>

          <div className="mt-10">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={goToPrevious}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-xl transition hover:border-white hover:bg-white hover:text-black"
                aria-label="Imagen anterior"
              >
                {"<"}
              </button>
              <button
                type="button"
                onClick={goToNext}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-xl transition hover:border-white hover:bg-white hover:text-black"
                aria-label="Imagen siguiente"
              >
                {">"}
              </button>
            </div>

            <div className="mt-7 grid min-w-0 gap-2 sm:grid-cols-2">
              {projects.map((project, index) => (
                <button
                  key={project.title}
                  type="button"
                  onClick={() => setProject(index)}
                  className={`border px-4 py-3 text-left text-sm transition ${
                    activeProjectIndex === index
                      ? "border-white bg-white text-black"
                      : "border-white/12 text-white/62 hover:border-white/40 hover:text-white"
                  }`}
                >
                  <span className="block text-xs uppercase tracking-[0.18em] opacity-60">
                    {project.type}
                  </span>
                  <span className="mt-1 block font-semibold">{project.title}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 flex gap-2">
              {activeProject.images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  className={`h-1.5 flex-1 rounded-full transition ${
                    activeImageIndex === index ? "bg-white" : "bg-white/22 hover:bg-white/44"
                  }`}
                  aria-label={`Ver imagen ${index + 1} de ${activeProject.title}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
