function parseBirthday(value) {
   if (typeof value !== "string") return null;
   const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
   if (!match) return null;

   const day = Number(match[1]);
   const month = Number(match[2]);
   const year = Number(match[3]);
   const date = new Date(Date.UTC(year, month - 1, day));

   if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
   ) {
      return null;
   }
   return date;
}

function datePartsInJakarta(now = new Date()) {
   const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
   }).formatToParts(now);
   const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
   return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
   };
}

function birthdayParts(value) {
   const date = value instanceof Date ? value : new Date(value);
   if (Number.isNaN(date.getTime())) return null;
   return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
   };
}

function isAtLeastAge(birthday, minimumAge, now = new Date()) {
   const birth = birthdayParts(birthday);
   if (!birth) return false;

   const today = datePartsInJakarta(now);
   const ageBeforeBirthday = today.month < birth.month
      || (today.month === birth.month && today.day < birth.day);
   const age = today.year - birth.year - (ageBeforeBirthday ? 1 : 0);
   return age >= minimumAge;
}

module.exports = {
   isAtLeastAge,
   parseBirthday,
};
