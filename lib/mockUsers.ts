export type AppUser = {
  id: string;
  email: string;
  password: string; // plain text for now, DEV ONLY
  name: string;
  role?: "owner" | "stylist" | "admin";
};

export const MOCK_USERS: AppUser[] = [
  {
    id: "1",
    email: "owner@example.com",
    password: "123456",
    name: "בעל הסלון",
    role: "owner",
  },
  {
    id: "2",
    email: "stylist@example.com",
    password: "123456",
    name: "עובדת בסלון",
    role: "stylist",
  },
];

