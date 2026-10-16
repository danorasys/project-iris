import { useCountUp } from "./motion";

/** A number that counts up when it appears ("0 %" to "75 %"), in less than
 * a second, and then stays as its value. */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const shown = useCountUp(value);
  return (
    <>
      {shown}
      {suffix}
    </>
  );
}
