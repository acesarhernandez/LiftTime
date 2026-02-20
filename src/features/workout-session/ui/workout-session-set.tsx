import { Plus, Minus, Trash2 } from "lucide-react";

import { useI18n } from "locales/client";
import { AVAILABLE_WORKOUT_SET_TYPES, MAX_WORKOUT_SET_COLUMNS } from "@/shared/constants/workout-set-types";
import { WorkoutSet, WorkoutSetType } from "@/features/workout-session/types/workout-set";
import { getWorkoutSetTypeLabels } from "@/features/workout-session/lib/workout-set-labels";
import { WorkoutSetVisualStatus } from "@/features/workout-session/lib/session-status";
import { Button } from "@/components/ui/button";

interface WorkoutSetRowProps {
  set: WorkoutSet;
  setIndex: number;
  visualStatus: WorkoutSetVisualStatus;
  isBarbellExercise?: boolean;
  showRirInput?: boolean;
  onChange: (setIndex: number, data: Partial<WorkoutSet>) => void;
  onFinish: () => void;
  onRemove: () => void;
}

const setTypeLabels: Record<string, string> = {
  WARMUP: "Warm-up",
  DROP: "Drop set",
  FAILURE: "To failure",
  AMRAP: "AMRAP",
  BACKOFF: "Back-off",
};

const PAIN_LEVEL_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "MILD", label: "Mild" },
  { value: "MODERATE", label: "Moderate" },
  { value: "SEVERE", label: "Severe" },
] as const;

const SET_STATUS_META: Record<WorkoutSetVisualStatus, { label: string; className: string }> = {
  NOT_STARTED: {
    label: "Not started",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
  },
  IN_PROGRESS: {
    label: "In progress",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
  },
  COMPLETE: {
    label: "Complete",
    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
  },
  MISSING_DATA: {
    label: "Missing data",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
  }
};

export function WorkoutSessionSet({
  set,
  setIndex,
  visualStatus,
  isBarbellExercise,
  showRirInput,
  onChange,
  onFinish,
  onRemove
}: WorkoutSetRowProps) {
  const t = useI18n();
  const types = set.types || [];
  const typeLabels = getWorkoutSetTypeLabels(t);
  const setTypeLabel = set.type && set.type !== "NORMAL" ? setTypeLabels[set.type] : null;
  const statusMeta = SET_STATUS_META[visualStatus];

  const handleTypeChange = (columnIndex: number) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTypes = [...types];
    newTypes[columnIndex] = e.target.value as WorkoutSetType;
    const payload: Partial<WorkoutSet> = { types: newTypes };

    if (newTypes[columnIndex] === "WEIGHT") {
      const newUnits = Array.isArray(set.units) ? [...set.units] : [];
      newUnits[columnIndex] = "lbs";
      payload.units = newUnits;
    }

    onChange(setIndex, payload);
  };

  const handleValueIntChange = (columnIndex: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValuesInt = Array.isArray(set.valuesInt) ? [...set.valuesInt] : [];
    const currentType = types[columnIndex];
    const value = e.target.value;

    if (!value) {
      newValuesInt[columnIndex] = 0;
      onChange(setIndex, { valuesInt: newValuesInt });
      return;
    }

    const parsedValue = currentType === "WEIGHT" ? parseFloat(value) : parseInt(value, 10);
    newValuesInt[columnIndex] = Number.isFinite(parsedValue) ? parsedValue : 0;

    const payload: Partial<WorkoutSet> = { valuesInt: newValuesInt };
    if (currentType === "WEIGHT") {
      const newUnits = Array.isArray(set.units) ? [...set.units] : [];
      newUnits[columnIndex] = "lbs";
      payload.units = newUnits;
    }

    onChange(setIndex, payload);
  };

  const handleValueSecChange = (columnIndex: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValuesSec = Array.isArray(set.valuesSec) ? [...set.valuesSec] : [];
    newValuesSec[columnIndex] = e.target.value ? parseInt(e.target.value, 10) : 0;
    onChange(setIndex, { valuesSec: newValuesSec });
  };

  const addColumn = () => {
    if (types.length < MAX_WORKOUT_SET_COLUMNS) {
      const firstAvailableType = AVAILABLE_WORKOUT_SET_TYPES.find((t) => !types.includes(t));
      if (firstAvailableType) {
        const newTypes = [...types, firstAvailableType];
        onChange(setIndex, { types: newTypes });
      }
    }
  };

  const removeColumn = (columnIndex: number) => {
    const newTypes = types.filter((_, idx) => idx !== columnIndex);
    const newValuesInt = Array.isArray(set.valuesInt) ? set.valuesInt.filter((_, idx) => idx !== columnIndex) : [];
    const newValuesSec = Array.isArray(set.valuesSec) ? set.valuesSec.filter((_, idx) => idx !== columnIndex) : [];
    const newUnits = Array.isArray(set.units) ? set.units.filter((_, idx) => idx !== columnIndex) : [];

    onChange(setIndex, {
      types: newTypes,
      valuesInt: newValuesInt,
      valuesSec: newValuesSec,
      units: newUnits,
    });
  };

  const handleEdit = () => {
    onChange(setIndex, { completed: false });
  };

  const handleRirChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (!rawValue) {
      onChange(setIndex, { rir: null });
      return;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    onChange(setIndex, { rir: Math.max(0, Math.min(10, Math.round(parsedValue))) });
  };

  const handlePainLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(setIndex, { painLevel: e.target.value as "NONE" | "MILD" | "MODERATE" | "SEVERE" });
  };

  const renderInputForType = (type: WorkoutSetType, columnIndex: number) => {
    const valuesInt = set.valuesInt || [];
    const valuesSec = set.valuesSec || [];

    switch (type) {
      case "TIME":
        return (
          <div className="flex gap-1 w-full">
            <input
              className="border border-black rounded px-1 py-2 w-1/2 text-base text-center font-bold dark:bg-slate-800 dark:placeholder:text-slate-500"
              disabled={set.completed}
              min={0}
              onChange={handleValueIntChange(columnIndex)}
              pattern="[0-9]*"
              placeholder="min"
              type="number"
              value={valuesInt[columnIndex] ?? ""}
            />
            <input
              className="border border-black rounded px-1 py-2 w-1/2 text-base text-center font-bold dark:bg-slate-800 dark:placeholder:text-slate-500"
              disabled={set.completed}
              max={59}
              min={0}
              onChange={handleValueSecChange(columnIndex)}
              pattern="[0-9]*"
              placeholder="sec"
              type="number"
              value={valuesSec[columnIndex] ?? ""}
            />
          </div>
        );
      case "WEIGHT":
        return (
          <div className="w-full">
            <div className="flex gap-1 w-full items-center">
              <input
                className="border border-black rounded px-1 py-2 w-1/2 text-base text-center font-bold dark:bg-slate-800"
                disabled={set.completed}
                min={0}
                onChange={handleValueIntChange(columnIndex)}
                pattern="[0-9]*"
                placeholder=""
                step="0.5"
                type="number"
                value={valuesInt[columnIndex] ?? ""}
              />
              <div className="border border-black rounded px-1 py-2 w-1/2 text-base font-bold bg-slate-100 dark:bg-slate-800 dark:text-gray-200 h-10 flex items-center justify-center">
                lbs
              </div>
            </div>
            {isBarbellExercise && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Barbell + Plates</p>}
          </div>
        );
      case "REPS":
        return (
          <input
            className="border border-black rounded px-1 py-2 w-full text-base text-center font-bold dark:bg-slate-800"
            disabled={set.completed}
            min={0}
            onChange={handleValueIntChange(columnIndex)}
            pattern="[0-9]*"
            placeholder=""
            type="number"
            value={valuesInt[columnIndex] ?? ""}
          />
        );
      case "BODYWEIGHT":
        return (
          <input
            className="border border-black rounded px-1 py-2 w-full text-base text-center font-bold dark:bg-slate-800"
            disabled={set.completed}
            placeholder=""
            readOnly
            value="✔"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full py-4 flex flex-col gap-2 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-sm mb-3 relative px-2 sm:px-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow dark:bg-blue-900 dark:text-blue-300">
            SET {setIndex + 1}
          </div>
          {setTypeLabel && <div className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800">{setTypeLabel}</div>}
          <div className={`text-xs font-semibold px-2 py-1 rounded-full ${statusMeta.className}`}>{statusMeta.label}</div>
        </div>
        <Button
          aria-label="Supprimer la série"
          className="bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 rounded-full p-1 h-8 w-8 flex items-center justify-center shadow transition"
          disabled={set.completed}
          onClick={onRemove}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Columns of types, stack vertical on mobile, horizontal on md+ */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-2 w-full">
        {types.map((type, columnIndex) => {
          // An option is available if it's not used by another column, OR it's the current column's type.
          const availableTypes = AVAILABLE_WORKOUT_SET_TYPES.filter((option) => !types.includes(option) || option === type);

          return (
            <div className="flex flex-col w-full md:w-auto" key={columnIndex}>
              <div className="flex items-center w-full gap-1 mb-1">
                <select
                  className="border border-black dark:border-slate-700 rounded font-bold px-1 py-2 text-base w-full bg-white dark:bg-slate-800 dark:text-gray-200 min-w-0 h-10 "
                  disabled={set.completed}
                  onChange={handleTypeChange(columnIndex)}
                  value={type}
                >
                  {availableTypes.map((availableType) => (
                    <option key={availableType} value={availableType}>
                      {typeLabels[availableType]}
                    </option>
                  ))}
                </select>
                {types.length > 1 && (
                  <Button
                    className="p-1 h-auto bg-red-500 hover:bg-red-600 dark:bg-red-900 dark:hover:bg-red-800 flex-shrink-0"
                    onClick={() => removeColumn(columnIndex)}
                    size="small"
                    variant="destructive"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {renderInputForType(type, columnIndex)}
            </div>
          );
        })}
      </div>

      {/* Add column button */}
      {types.length < MAX_WORKOUT_SET_COLUMNS && !set.completed && (
        <div className="flex w-full justify-start mt-1">
          <Button
            className="font-bold px-4 py-2 text-sm rounded-xl w-full md:w-auto mt-2"
            disabled={set.completed}
            onClick={addColumn}
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            <span className="block md:hidden">{t("workout_builder.session.add_row")}</span>
            <span className="hidden md:block">{t("workout_builder.session.add_column")}</span>
          </Button>
        </div>
      )}

      <div className={`grid grid-cols-1 ${showRirInput ? "md:grid-cols-2" : ""} gap-2 mt-1`}>
        {showRirInput && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">RIR (reps in reserve)</label>
            <input
              className="border border-black rounded px-2 py-2 text-sm text-center font-bold dark:bg-slate-800"
              disabled={set.completed}
              max={10}
              min={0}
              onChange={handleRirChange}
              placeholder="e.g. 2"
              type="number"
              value={set.rir ?? ""}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Pain / discomfort</label>
          <select
            className="border border-black dark:border-slate-700 rounded px-2 py-2 text-sm font-semibold bg-white dark:bg-slate-800 dark:text-gray-200"
            disabled={set.completed}
            onChange={handlePainLevelChange}
            value={set.painLevel ?? "NONE"}
          >
            {PAIN_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Finish & Edit buttons, full width on mobile */}
      <div className="flex gap-2 w-full md:w-auto mt-2">
        <Button
          className=" dark:text-white font-bold px-4 py-2 text-sm rounded-xl flex-1"
          disabled={set.completed}
          onClick={onFinish}
          variant="default"
        >
          {t("workout_builder.session.finish_set")}
        </Button>
        {set.completed && (
          <Button
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-2 text-sm rounded-xl flex-1 border border-gray-300"
            onClick={handleEdit}
            variant="outline"
          >
            {t("commons.edit")}
          </Button>
        )}
      </div>
    </div>
  );
}
