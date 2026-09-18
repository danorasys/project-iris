export function calculateAge(birthDateISO: string): number {
    const birthDate = new Date(birthDateISO)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const hasNotHadBirthdayYet =
        today.getMonth() < birthDate.getMonth() ||
        (today.getMonth() === birthDate.getMonth() &&
            today.getDate() < birthDate.getDate())
    if (hasNotHadBirthdayYet) age--
    return age
}
