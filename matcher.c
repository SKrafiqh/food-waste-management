#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_LINE 1024
#define MAX_ROWS 1000

// Struct definitions corresponding to Supabase schema exports
typedef struct {
  char id[50];
  char restaurant_id[50];
  char donor_name[255]; // Can be empty
  char food_type[100];
  float quantity_kg;
  int expiry_hours;
  char location_code[50];
  char status[50];
  int is_matched; // internal flag
} Donation;

typedef struct {
  char id[50];
  char ngo_id[50];
  char food_category[100];
  int urgency; // 1: Normal, 2: High, 3: Critical
  float needed_kg;
  char status[50];
  int is_matched; // internal flag
} Request;

typedef struct {
  char id[50];
  char name[255];
  char location_code[50];
} NGO;

// Arrays for data
Donation donations[MAX_ROWS];
int num_donations = 0;

Request requests[MAX_ROWS];
int num_requests = 0;

NGO ngos[MAX_ROWS];
int num_ngos = 0;

// Helper to remove quotes if present
void clean_string(char *str) {
  if (str[0] == '"') {
    int len = strlen(str);
    memmove(str, str + 1, len - 2);
    str[len - 2] = '\0';
  }
}

// Read Donations CSV (Header:
// id,restaurant_id,donor_name,food_type,quantity_kg,expiry_hours,location_code,status)
void load_donations(const char *filename) {
  FILE *file = fopen(filename, "r");
  if (!file) {
    printf("Could not open %s\n", filename);
    return;
  }
  char line[MAX_LINE];
  fgets(line, MAX_LINE, file); // skip header
  while (fgets(line, MAX_LINE, file) && num_donations < MAX_ROWS) {
    char *token;
    token = strtok(line, ",");
    if (!token)
      continue;
    strcpy(donations[num_donations].id, token);
    clean_string(donations[num_donations].id);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    strcpy(donations[num_donations].restaurant_id, token);
    clean_string(donations[num_donations].restaurant_id);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    strcpy(donations[num_donations].donor_name, token);
    clean_string(donations[num_donations].donor_name);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    strcpy(donations[num_donations].food_type, token);
    clean_string(donations[num_donations].food_type);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    donations[num_donations].quantity_kg = atof(token);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    donations[num_donations].expiry_hours = atoi(token);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    strcpy(donations[num_donations].location_code, token);
    clean_string(donations[num_donations].location_code);
    token = strtok(NULL, "\n");
    if (!token)
      continue;
    strcpy(donations[num_donations].status, token);
    clean_string(donations[num_donations].status);

    donations[num_donations].is_matched =
        (strcmp(donations[num_donations].status, "AVAILABLE") != 0);
    num_donations++;
  }
  fclose(file);
}

// Read Requests CSV (Header: id,ngo_id,food_category,urgency,needed_kg,status)
void load_requests(const char *filename) {
  FILE *file = fopen(filename, "r");
  if (!file) {
    printf("Could not open %s\n", filename);
    return;
  }
  char line[MAX_LINE];
  fgets(line, MAX_LINE, file); // skip header
  while (fgets(line, MAX_LINE, file) && num_requests < MAX_ROWS) {
    char *token;
    token = strtok(line, ",");
    if (!token)
      continue;
    strcpy(requests[num_requests].id, token);
    clean_string(requests[num_requests].id);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    strcpy(requests[num_requests].ngo_id, token);
    clean_string(requests[num_requests].ngo_id);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    strcpy(requests[num_requests].food_category, token);
    clean_string(requests[num_requests].food_category);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    requests[num_requests].urgency = atoi(token);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    requests[num_requests].needed_kg = atof(token);
    token = strtok(NULL, "\n");
    if (!token)
      continue;
    strcpy(requests[num_requests].status, token);
    clean_string(requests[num_requests].status);

    requests[num_requests].is_matched =
        (strcmp(requests[num_requests].status, "PENDING") != 0);
    num_requests++;
  }
  fclose(file);
}

// Read NGOs CSV (Header: id,name,location_code)
void load_ngos(const char *filename) {
  FILE *file = fopen(filename, "r");
  if (!file) {
    printf("Could not open %s\n", filename);
    return;
  }
  char line[MAX_LINE];
  fgets(line, MAX_LINE, file); // skip header
  while (fgets(line, MAX_LINE, file) && num_ngos < MAX_ROWS) {
    char *token;
    token = strtok(line, ",");
    if (!token)
      continue;
    strcpy(ngos[num_ngos].id, token);
    clean_string(ngos[num_ngos].id);
    token = strtok(NULL, ",");
    if (!token)
      continue;
    strcpy(ngos[num_ngos].name, token);
    clean_string(ngos[num_ngos].name);
    token = strtok(NULL, "\n");
    if (!token)
      continue;
    strcpy(ngos[num_ngos].location_code, token);
    clean_string(ngos[num_ngos].location_code);
    num_ngos++;
  }
  fclose(file);
}

// Helper to get NGO location
const char *get_ngo_location(const char *ngo_id) {
  for (int i = 0; i < num_ngos; i++) {
    if (strcmp(ngos[i].id, ngo_id) == 0)
      return ngos[i].location_code;
  }
  return "";
}

// Core Matching Engine Action
void run_matching_engine() {
  FILE *matches_file = fopen("../data/matches.csv", "w");
  if (!matches_file) {
    printf("Could not open ../data/matches.csv for writing\n");
    return;
  }
  fprintf(matches_file, "donation_id,request_id,ngo_id,match_score,status\n");

  FILE *report_file = fopen("../data/admin_report.txt", "w");
  if (!report_file) {
    printf("Could not open ../data/admin_report.txt for writing\n");
    fclose(matches_file);
    return;
  }
  fprintf(report_file, "=== FOODSHARE ADMIN MATCHING REPORT ===\n\n");

  int matches_found = 0;

  // Loop over available donations
  for (int d = 0; d < num_donations; d++) {
    if (donations[d].is_matched)
      continue;

    int best_score = -1;
    int best_request_idx = -1;

    // Find the best pending request
    for (int r = 0; r < num_requests; r++) {
      if (requests[r].is_matched)
        continue;

      // Basic generic type checking or string matching if needed, skipping for
      // brevity, matching on availability.

      int urgency_score = requests[r].urgency * 50;
      int expiry_score = (donations[d].expiry_hours <= 3) ? 30 : 0;

      int distance_score = 0;
      const char *ngo_loc = get_ngo_location(requests[r].ngo_id);
      if (strcmp(donations[d].location_code, ngo_loc) == 0) {
        distance_score = 20;
      }

      int total_score = urgency_score + expiry_score + distance_score;

      if (total_score > best_score) {
        best_score = total_score;
        best_request_idx = r;
      }
    }

    // If a match is found
    if (best_request_idx != -1) {
      requests[best_request_idx].is_matched = 1;
      donations[d].is_matched = 1;

      fprintf(matches_file, "%s,%s,%s,%d,PENDING_COLLECTION\n", donations[d].id,
              requests[best_request_idx].id, requests[best_request_idx].ngo_id,
              best_score);

      fprintf(report_file,
              "Matched Donation [%s] (%s, %s%s) -> NGO [%s] (Score: %d)\n",
              donations[d].id, donations[d].food_type,
              (donations[d].expiry_hours <= 3) ? "EXPIRING, " : "",
              donations[d].location_code, requests[best_request_idx].ngo_id,
              best_score);
      matches_found++;
    }
  }

  fprintf(report_file, "\nTotal new matches found: %d\n", matches_found);

  fclose(matches_file);
  fclose(report_file);
  printf("Matching complete. Found %d matches.\n", matches_found);
}

int main(int argc, char *argv[]) {
  printf("Initializing FoodShare Matching Engine...\n");

  // Load datasets from ../data/ assuming executable is in c_engine/
  load_donations("../data/donations.csv");
  load_requests("../data/requests.csv");
  load_ngos("../data/ngos.csv");

  printf("Loaded:\n");
  printf("- Donations: %d\n", num_donations);
  printf("- Requests:  %d\n", num_requests);
  printf("- NGOs:      %d\n", num_ngos);

  run_matching_engine();

  return 0;
}
