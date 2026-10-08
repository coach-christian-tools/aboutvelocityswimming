'use client';

import { useState } from 'react';

export type CourseType = 'LCM' | 'SCY' | 'SCM';
export type StrokeType = 'IM' | 'FL' | 'BK' | 'BR' | 'FR';

export interface SwimEventSelection {
  course?: CourseType | null;
  stroke?: StrokeType | null;
  distance?: number | null;
  isRelay?: boolean | null;
  eventName?: string | null;
}

export interface EventChip {
  distance: number;
  isRelay: boolean;
  label: string;
}

export interface CourseData {
  IM: EventChip[];
  FL: EventChip[];
  BK: EventChip[];
  BR: EventChip[];
  FR_SHORT: EventChip[];
  FR_DIST: EventChip[];
}

export const COURSE_EVENT_CHIPS: Record<CourseType, CourseData> = {
  SCY: {
    IM: [
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
      { distance: 400, isRelay: false, label: '400' },
      { distance: 100, isRelay: true, label: '100R' },
      { distance: 200, isRelay: true, label: '200R' },
      { distance: 400, isRelay: true, label: '400R' },
    ],
    FL: [
      { distance: 25, isRelay: false, label: '25' },
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    BK: [
      { distance: 25, isRelay: false, label: '25' },
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    BR: [
      { distance: 25, isRelay: false, label: '25' },
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    FR_SHORT: [
      { distance: 25, isRelay: false, label: '25' },
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
      { distance: 100, isRelay: true, label: '100R' },
      { distance: 200, isRelay: true, label: '200R' },
    ],
    FR_DIST: [
      { distance: 500, isRelay: false, label: '500' },
      { distance: 1000, isRelay: false, label: '1000' },
      { distance: 1650, isRelay: false, label: '1650' },
      { distance: 400, isRelay: true, label: '400R' },
      { distance: 800, isRelay: true, label: '800R' },
    ],
  },
  LCM: {
    IM: [
      { distance: 200, isRelay: false, label: '200' },
      { distance: 400, isRelay: false, label: '400' },
      { distance: 200, isRelay: true, label: '200R' },
      { distance: 400, isRelay: true, label: '400R' },
    ],
    FL: [
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    BK: [
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    BR: [
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    FR_SHORT: [
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
      { distance: 200, isRelay: true, label: '200R' },
    ],
    FR_DIST: [
      { distance: 400, isRelay: false, label: '400' },
      { distance: 800, isRelay: false, label: '800' },
      { distance: 1500, isRelay: false, label: '1500' },
      { distance: 400, isRelay: true, label: '400R' },
      { distance: 800, isRelay: true, label: '800R' },
    ],
  },
  SCM: {
    IM: [
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
      { distance: 400, isRelay: false, label: '400' },
      { distance: 100, isRelay: true, label: '100R' },
      { distance: 200, isRelay: true, label: '200R' },
      { distance: 400, isRelay: true, label: '400R' },
    ],
    FL: [
      { distance: 25, isRelay: false, label: '25' },
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    BK: [
      { distance: 25, isRelay: false, label: '25' },
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    BR: [
      { distance: 25, isRelay: false, label: '25' },
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
    ],
    FR_SHORT: [
      { distance: 25, isRelay: false, label: '25' },
      { distance: 50, isRelay: false, label: '50' },
      { distance: 100, isRelay: false, label: '100' },
      { distance: 200, isRelay: false, label: '200' },
      { distance: 100, isRelay: true, label: '100R' },
      { distance: 200, isRelay: true, label: '200R' },
    ],
    FR_DIST: [
      { distance: 400, isRelay: false, label: '400' },
      { distance: 800, isRelay: false, label: '800' },
      { distance: 1500, isRelay: false, label: '1500' },
      { distance: 400, isRelay: true, label: '400R' },
      { distance: 800, isRelay: true, label: '800R' },
    ],
  },
};

export function formatEventName(
  course?: CourseType | null,
  stroke?: StrokeType | null,
  distance?: number | null,
  isRelay?: boolean | null
): string {
  if (!stroke || !distance) {
    return course || '';
  }
  const unit = course === 'SCY' ? 'Yard' : course === 'LCM' || course === 'SCM' ? 'Meter' : '';
  const strokeNames: Record<StrokeType, string> = {
    IM: 'Individual Medley',
    FL: 'Butterfly',
    BK: 'Backstroke',
    BR: 'Breaststroke',
    FR: 'Freestyle',
  };
  const strokeLabel = strokeNames[stroke] || stroke;
  const courseSuffix = course ? ` (${course})` : '';
  if (isRelay) {
    if (stroke === 'IM') {
      return unit ? `${distance} ${unit} Medley Relay${courseSuffix}` : `${distance} Medley Relay${courseSuffix}`;
    }
    if (stroke === 'FR') {
      return unit ? `${distance} ${unit} Free Relay${courseSuffix}` : `${distance} Free Relay${courseSuffix}`;
    }
    return unit ? `${distance} ${unit} ${stroke} Relay${courseSuffix}` : `${distance} ${stroke} Relay${courseSuffix}`;
  }
  return unit ? `${distance} ${unit} ${strokeLabel}${courseSuffix}` : `${distance} ${strokeLabel}${courseSuffix}`;
}

export interface EventSelectorProps {
  value?: SwimEventSelection | null;
  onChange?: (selection: SwimEventSelection | null) => void;
  className?: string;
  defaultCourse?: CourseType;
  allowPartialSelection?: boolean;
}

export default function EventSelector({
  value,
  onChange,
  className = '',
  defaultCourse = 'SCY',
  allowPartialSelection = false,
}: EventSelectorProps) {
  // Internal state when uncontrolled
  const [internalCourse, setInternalCourse] = useState<CourseType>(defaultCourse);
  const [internalStroke, setInternalStroke] = useState<StrokeType | null>(allowPartialSelection ? null : 'FR');
  const [internalDistance, setInternalDistance] = useState<number | null>(allowPartialSelection ? null : 100);
  const [internalIsRelay, setInternalIsRelay] = useState<boolean>(false);

  const activeCourse = value !== undefined ? (value?.course ?? null) : internalCourse;
  const activeStroke = value !== undefined ? (value?.stroke ?? null) : internalStroke;
  const activeDistance = value !== undefined ? (value?.distance ?? null) : internalDistance;
  const activeIsRelay = value !== undefined ? (value?.isRelay ?? false) : internalIsRelay;

  const displayCourse: CourseType = activeCourse || internalCourse || defaultCourse || 'SCY';
  const currentCourseData = COURSE_EVENT_CHIPS[displayCourse];

  const handleCourseChange = (newCourse: CourseType) => {
    if (allowPartialSelection) {
      if (activeCourse === newCourse) {
        // Toggle OFF current course
        if (activeStroke && activeDistance) {
          onChange?.({
            course: null,
            stroke: activeStroke,
            distance: activeDistance,
            isRelay: activeIsRelay,
            eventName: formatEventName(null, activeStroke, activeDistance, activeIsRelay),
          });
        } else {
          onChange?.(null);
        }
        return;
      }

      // Toggle ON or switch to newCourse
      if (activeStroke && activeDistance) {
        onChange?.({
          course: newCourse,
          stroke: activeStroke,
          distance: activeDistance,
          isRelay: activeIsRelay,
          eventName: formatEventName(newCourse, activeStroke, activeDistance, activeIsRelay),
        });
      } else {
        onChange?.({
          course: newCourse,
          stroke: null,
          distance: null,
          isRelay: false,
          eventName: newCourse,
        });
      }
      return;
    }

    const nextCourseData = COURSE_EVENT_CHIPS[newCourse];
    let candidateChips: EventChip[] = [];

    if (activeStroke === 'FR') {
      candidateChips = [...nextCourseData.FR_SHORT, ...nextCourseData.FR_DIST];
    } else if (activeStroke) {
      candidateChips = nextCourseData[activeStroke] || [];
    }

    const match = candidateChips.find(
      (c) => c.distance === activeDistance && c.isRelay === activeIsRelay
    );

    let nextDistance = activeDistance;
    let nextIsRelay = activeIsRelay;

    if (!match && candidateChips.length > 0) {
      nextDistance = candidateChips[0].distance;
      nextIsRelay = candidateChips[0].isRelay;
    }

    if (value && onChange && activeStroke && nextDistance !== null) {
      onChange({
        course: newCourse,
        stroke: activeStroke,
        distance: nextDistance,
        isRelay: nextIsRelay,
        eventName: formatEventName(newCourse, activeStroke, nextDistance, nextIsRelay),
      });
    } else {
      setInternalCourse(newCourse);
      if (nextDistance !== null) {
        setInternalDistance(nextDistance);
        setInternalIsRelay(nextIsRelay);
      }
    }
  };

  const handleSelect = (stroke: StrokeType, distance: number, isRelay: boolean) => {
    const isAlreadySelected = activeStroke === stroke && activeDistance === distance && activeIsRelay === isRelay;

    if (allowPartialSelection) {
      if (isAlreadySelected) {
        // Toggle OFF this chip
        if (activeCourse) {
          onChange?.({
            course: activeCourse,
            stroke: null,
            distance: null,
            isRelay: false,
            eventName: activeCourse,
          });
        } else {
          onChange?.(null);
        }
        return;
      }

      // Toggle ON this chip
      onChange?.({
        course: activeCourse || null,
        stroke,
        distance,
        isRelay,
        eventName: formatEventName(activeCourse, stroke, distance, isRelay),
      });
      return;
    }

    const eventName = formatEventName(activeCourse || defaultCourse, stroke, distance, isRelay);
    const selection: SwimEventSelection = {
      course: activeCourse || defaultCourse,
      stroke,
      distance,
      isRelay,
      eventName,
    };

    if (onChange) {
      onChange(selection);
    } else {
      setInternalStroke(stroke);
      setInternalDistance(distance);
      setInternalIsRelay(isRelay);
    }
  };

  const isFrShortSelected =
    activeStroke === 'FR' &&
    currentCourseData.FR_SHORT.some(
      (c) => c.distance === activeDistance && c.isRelay === activeIsRelay
    );

  const isFrDistSelected =
    activeStroke === 'FR' &&
    currentCourseData.FR_DIST.some(
      (c) => c.distance === activeDistance && c.isRelay === activeIsRelay
    );

  const renderChip = (stroke: StrokeType, chip: EventChip) => {
    const isChipSelected =
      activeStroke === stroke &&
      activeDistance === chip.distance &&
      activeIsRelay === chip.isRelay;

    return (
      <button
        key={`${stroke}-${chip.label}`}
        type="button"
        onClick={() => handleSelect(stroke, chip.distance, chip.isRelay)}
        className={`w-full py-1 px-1 rounded-md text-xs font-semibold cursor-pointer select-none text-center border ${
          isChipSelected
            ? 'bg-primary-blue text-white border-primary-blue'
            : 'bg-bg hover:bg-hover-bg text-text-primary border-border/80 hover:border-primary-blue/40 hover:text-primary-blue'
        }`}
      >
        {chip.label}
      </button>
    );
  };

  const renderCourseButton = (course: CourseType) => {
    const isSelected = activeCourse === course;

    return (
      <button
        key={course}
        type="button"
        onClick={() => handleCourseChange(course)}
        title={`Select ${course} course`}
        className={`w-full py-1 px-1 rounded-md text-xs font-bold cursor-pointer select-none text-center border ${
          isSelected
            ? 'bg-teal-600 text-white border-teal-600'
            : 'bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30 hover:border-teal-500/50'
        }`}
      >
        {course}
      </button>
    );
  };

  const isFullWidth = className.includes('w-full');

  return (
    <div
      className={`rounded-lg border border-border bg-surface px-2.5 pb-2.5 pt-1.5 shadow-xs flex flex-col gap-1 ${
        isFullWidth ? 'w-full' : 'w-fit'
      } ${className}`}
    >
      {/* Column Headers: IM, FL, BK, BR, FR, DST */}
      <div
        className={`grid gap-1.5 text-center select-none leading-none pt-0.5 pb-0 ${
          isFullWidth ? 'grid-cols-6' : 'grid-cols-[repeat(6,minmax(42px,50px))]'
        }`}
      >
        <div
          className={`text-sm font-extrabold ${
            activeStroke === 'IM' ? 'text-primary-blue' : 'text-text-primary'
          }`}
        >
          IM
        </div>
        <div
          className={`text-sm font-extrabold ${
            activeStroke === 'FL' ? 'text-primary-blue' : 'text-text-primary'
          }`}
        >
          FL
        </div>
        <div
          className={`text-sm font-extrabold ${
            activeStroke === 'BK' ? 'text-primary-blue' : 'text-text-primary'
          }`}
        >
          BK
        </div>
        <div
          className={`text-sm font-extrabold ${
            activeStroke === 'BR' ? 'text-primary-blue' : 'text-text-primary'
          }`}
        >
          BR
        </div>
        <div
          className={`text-sm font-extrabold ${
            isFrShortSelected ? 'text-primary-blue' : 'text-text-primary'
          }`}
        >
          FR
        </div>
        <div
          className={`text-sm font-extrabold ${
            isFrDistSelected ? 'text-primary-blue' : 'text-text-primary'
          }`}
        >
          DST
        </div>
      </div>

      {/* Grid: 6 columns with LCM, SCY, SCM directly in the same grid */}
      <div
        className={`grid gap-1.5 items-start ${
          isFullWidth ? 'grid-cols-6' : 'grid-cols-[repeat(6,minmax(42px,50px))]'
        }`}
      >
        {/* Col 1: IM */}
        <div className="flex flex-col gap-1">
          {currentCourseData.IM.map((chip) => renderChip('IM', chip))}
        </div>

        {/* Col 2: FL + LCM */}
        <div className="flex flex-col gap-1">
          {currentCourseData.FL.map((chip) => renderChip('FL', chip))}
          {renderCourseButton('LCM')}
        </div>

        {/* Col 3: BK + SCY */}
        <div className="flex flex-col gap-1">
          {currentCourseData.BK.map((chip) => renderChip('BK', chip))}
          {renderCourseButton('SCY')}
        </div>

        {/* Col 4: BR + SCM */}
        <div className="flex flex-col gap-1">
          {currentCourseData.BR.map((chip) => renderChip('BR', chip))}
          {renderCourseButton('SCM')}
        </div>

        {/* Col 5: FR (200 and less) */}
        <div className="flex flex-col gap-1">
          {currentCourseData.FR_SHORT.map((chip) => renderChip('FR', chip))}
        </div>

        {/* Col 6: DST (400 and over) */}
        <div className="flex flex-col gap-1">
          {currentCourseData.FR_DIST.map((chip) => renderChip('FR', chip))}
        </div>
      </div>
    </div>
  );
}

