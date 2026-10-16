import type { ReactNode } from "react";
import type { StudentProfile } from "@iris/shared-types";
import { useAvatars } from "@/shared/api/hooks/useAuthApi";
import { IconEye } from "@/shared/ui/icons";
import { KidCard, KidCards, KidHeader, KidPage, KidPager } from "@/shared/ui/kid/KidKit";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { ViewEnter } from "@/shared/ui/ViewEnter";

// HU-30: three profiles at a time, so each one stays big. More than that
// and the arrows show up.
const PROFILES_PER_GROUP = 3;

interface ProfileChooserProps {
  profiles: StudentProfile[];
  group: number;
  onGroup: (group: number) => void;
  onPick: (profile: StudentProfile) => void;
  onBack: () => void;
  /** Loading, an error or no profiles, in place of the cards. */
  status?: ReactNode;
}

/** "¿Quién eres?": the kid finds their avatar among three very big cards in a
 * row, each with the band in the color of their avatar, with the arrows on
 * the edges to see the others. The eyes can pick them too (they fill up). */
export function ProfileChooser({ profiles, group, onGroup, onPick, onBack, status }: ProfileChooserProps) {
  const avatars = useAvatars().data;
  const groups = Math.max(1, Math.ceil(profiles.length / PROFILES_PER_GROUP));
  const current = Math.min(group, groups - 1);
  const shown = profiles.slice(current * PROFILES_PER_GROUP, (current + 1) * PROFILES_PER_GROUP);
  const paged = groups > 1;

  return (
    <KidPage
      back={{ label: "Volver", onSelect: onBack }}
      previousArrow={
        paged
          ? { label: "Ver los perfiles anteriores", disabled: current === 0, onSelect: () => onGroup(current - 1) }
          : undefined
      }
      nextArrow={
        paged
          ? {
              label: "Ver los perfiles siguientes",
              disabled: current === groups - 1,
              onSelect: () => onGroup(current + 1),
            }
          : undefined
      }
    >
      <KidHeader
        eyebrow="Portal Peques"
        icon={<IconEye aria-hidden="true" />}
        title="¿Quién eres?"
        subtitle="Mira tu avatar para entrar."
      />

      {status}

      {profiles.length > 0 && (
        // Each group comes in from the side of its arrow.
        <ViewEnter view={current} level={current}>
          <KidCards>
            {shown.map((profile, index) => (
              <KidCard
                key={profile.id}
                title={profile.first_name}
                // The name is already the button's text, the picture goes quiet.
                picture={<StudentAvatarImage avatarId={profile.avatar_id} size="large" label="" />}
                color={avatars?.find((avatar) => avatar.id === profile.avatar_id)?.accent_color}
                order={index}
                large
                onSelect={() => onPick(profile)}
              />
            ))}
          </KidCards>
        </ViewEnter>
      )}

      {paged && (
        <KidPager
          current={current}
          groups={groups}
          text={`Perfiles ${current * PROFILES_PER_GROUP + 1} a ${current * PROFILES_PER_GROUP + shown.length} de ${profiles.length}`}
        />
      )}
    </KidPage>
  );
}
