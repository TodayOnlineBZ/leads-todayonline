export function passwordProblems(password: string) {
  const problems: string[] = [];
  if (password.length < 10) problems.push("minstens 10 tekens");
  if (!/\d/.test(password)) problems.push("minstens 1 cijfer");
  if (!/[^\p{L}\p{N}\s]/u.test(password)) problems.push("minstens 1 speciaal teken, zoals ! ? @ of #");
  return problems;
}

export function passwordMessage(password: string) {
  const problems = passwordProblems(password);
  if (!problems.length) return "";
  return "Je wachtwoord mist nog: " + problems.join(", ") + ".";
}
