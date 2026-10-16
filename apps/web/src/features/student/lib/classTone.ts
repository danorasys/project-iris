import type { ClassroomColor } from "@iris/shared-types";
import type { KidTone } from "@/shared/ui/kid/KidKit";

// The color the teacher picked for a class, as the tone of the kid's cards:
// its units and lessons go in it too, so the kid always knows where they are.
const TONES: Record<ClassroomColor, KidTone> = {
  blue: "blue",
  navy: "navy",
  orange: "orange",
  green: "mint",
  gold: "sun",
};

export function classTone(color: ClassroomColor | undefined): KidTone {
  return color ? TONES[color] : "blue";
}
