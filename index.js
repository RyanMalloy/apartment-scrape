const { chromium } = require("playwright");
const xlsx = require("xlsx");

async function getApartments() {
  const allData = [];
  const cities = ["westlake-oh"];

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const city of cities) {
    let currentPage = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      let apartmentLink = `https://www.apartments.com/${city}/${currentPage > 1 ? currentPage + "/" : ""}`;
      await page.goto(apartmentLink);
      await page.waitForSelector(".placard-content");

      const allApartmentsInfo = await page.$$eval(".placard-content", (placards) => {
        return placards.map((placard) => {
          const propertyLink = placard.querySelector(".property-link")?.href;
          return {
            propertyLink,
          };
        });
      });

      for (const apartment of allApartmentsInfo) {
        if (apartment.propertyLink) {
          await page.goto(apartment.propertyLink);
          await page.waitForSelector("#propertyHeader");

          const detailedInfo = await page.evaluate(() => {
            const propertyInfo = {
              name: document.querySelector("#propertyName")?.textContent.trim(),
              address: document.querySelector(".delivery-address")?.textContent.trim(),
            };

            const headerData = [...document.querySelectorAll(".priceBedRangeInfo .priceBedRangeInfoInnerContainer")].reduce((acc, el) => {
              const label = el.querySelector(".rentInfoLabel")?.textContent.trim();
              const detail = el.querySelector(".rentInfoDetail")?.textContent.trim();
              acc[label] = detail;
              return acc;
            }, {});

            const apartments = [...document.querySelectorAll(".pricingGridItem")].map((item) => {
              const name = item.querySelector(".modelName")?.textContent.trim();
              const price = item.querySelector(".rentLabel")?.textContent.trim();
              const detailsText = [...item.querySelectorAll(".detailsTextWrapper span")].map((span) => span.textContent.trim()).join(", ");
              const [bedrooms, bathrooms, sqft] = detailsText.split(", ");

              const availableUnits = [...item.querySelectorAll(".unitContainer")].reduce((units, unit, index) => {
                units[`unit${index + 1}`] = {
                  unit: unit.querySelector(".unitBtn")?.textContent.trim().replace("Unit ", "").trim() || "",
                  price: unit.querySelector(".pricingColumn span:not(.screenReaderOnly)")?.textContent.trim() || "",
                  sqft: unit.querySelector(".sqftColumn span:not(.screenReaderOnly)")?.textContent.trim() || "",
                  availability: unit.querySelector(".availableColumn .dateAvailable")?.textContent.trim().split("\n").pop().trim() || "Not Available",
                };
                return units;
              }, {});

              return {
                name,
                price,
                bedrooms,
                bathrooms,
                sqft,
                availableUnits,
              };
            });

            return {
              name: propertyInfo.name,
              address: propertyInfo.address,
              headerData,
              apartments,
            };
          });

          allData.push({
            name: detailedInfo.name,
            address: detailedInfo.address,
            headerData: detailedInfo.headerData,
            apartments: detailedInfo.apartments,
          });
        }
      }

      // Check for next page
      const nextPageElement = await page.evaluate(() => {
        const currentPageElement = document.querySelector('a[aria-label="Current Page"]');
        const nextSibling = currentPageElement?.parentNode?.nextElementSibling;
        const nextPageLink = nextSibling?.querySelector("a");
        return nextPageLink ? nextPageLink.href : null;
      });

      if (nextPageElement) {
        currentPage++;
      } else {
        hasNextPage = false;
      }
    }
  }

  // Function to flatten apartment data
  const flattenApartmentData = (jsonData) => {
    const flattenedData = [];
    jsonData.forEach(property => {
      property.apartments.forEach(apartment => {
        const baseData = {
          PropertyName: property.name,
          PropertyAddress: property.address,
          MonthlyRent: property.headerData["Monthly Rent"],
          Bedrooms: property.headerData.Bedrooms,
          Bathrooms: property.headerData.Bathrooms,
          SquareFeet: property.headerData["Square Feet"],
          ApartmentName: apartment.name,
          ApartmentPrice: apartment.price,
          ApartmentBedrooms: apartment.bedrooms,
          ApartmentBathrooms: apartment.bathrooms,
          ApartmentSqft: apartment.sqft
        };

        const availableUnits = apartment.availableUnits;
        if (Object.keys(availableUnits).length === 0) {
          flattenedData.push(baseData);
        } else {
          Object.keys(availableUnits).forEach(unitKey => {
            const unit = availableUnits[unitKey];
            flattenedData.push({
              ...baseData,
              UnitNumber: unit.unit,
              UnitPrice: unit.price,
              UnitSqft: unit.sqft,
              UnitAvailability: unit.availability
            });
          });
        }
      });
    });
    return flattenedData;
  };

  // Flatten the JSON data
  const flattenedData = flattenApartmentData(allData);

  // Convert JSON to sheet
  const worksheet = xlsx.utils.json_to_sheet(flattenedData);

  // Append sheet to workbook
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Apartments");

  // Write workbook to file
  xlsx.writeFile(workbook, "ApartmentsData.xlsx");

  await browser.close();
}

(async () => {
  await getApartments();
})();
