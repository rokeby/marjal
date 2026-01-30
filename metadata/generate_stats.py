import csv
import random

random.seed(42)

years = list(range(1984, 2025))

def lerp(a, b, t):
    return a + (b - a) * t

def jitter(val, pct=0.05):
    return val * (1 + random.uniform(-pct, pct))

rows = []
for year in years:
    t = (year - 1984) / (2024 - 1984)
    is_drought = (year == 2005)
    is_dana = (year == 2024)

    if year <= 2005:
        t2 = (year - 1984) / (2005 - 1984)
        ndvi_mean = lerp(0.55, 0.38, t2)
    else:
        t2 = (year - 2005) / (2024 - 2005)
        ndvi_mean = lerp(0.38, 0.52, t2)
    if is_drought: ndvi_mean = 0.30
    if is_dana: ndvi_mean = 0.48
    ndvi_mean = jitter(ndvi_mean, 0.04)
    rows.append([year,"NDVI",f"{ndvi_mean:.4f}",f"{jitter(lerp(0.08,0.12,t),0.1):.4f}",f"{jitter(lerp(0.85,0.78,t),0.03):.4f}",f"{jitter(lerp(0.14,0.16,t),0.08):.4f}"])

    ndwi_mean = lerp(0.25, 0.10, t)
    if is_drought: ndwi_mean = 0.05
    if is_dana: ndwi_mean = 0.35
    ndwi_mean = jitter(ndwi_mean, 0.06)
    rows.append([year,"NDWI",f"{ndwi_mean:.4f}",f"{jitter(lerp(-0.05,-0.12,t),0.15):.4f}",f"{jitter(lerp(0.60,0.48,t),0.05):.4f}",f"{jitter(lerp(0.14,0.18,t),0.08):.4f}"])

    if year <= 2005:
        t2 = (year - 1984) / (2005 - 1984)
        evi_mean = lerp(0.42, 0.28, t2)
    else:
        t2 = (year - 2005) / (2024 - 2005)
        evi_mean = lerp(0.28, 0.40, t2)
    if is_drought: evi_mean = 0.22
    evi_mean = jitter(evi_mean, 0.04)
    rows.append([year,"EVI",f"{evi_mean:.4f}",f"{jitter(lerp(0.06,0.09,t),0.1):.4f}",f"{jitter(lerp(0.70,0.60,t),0.04):.4f}",f"{jitter(lerp(0.09,0.13,t),0.08):.4f}"])

    mndwi_mean = lerp(0.22, 0.08, t)
    if is_drought: mndwi_mean = 0.02
    if is_dana: mndwi_mean = 0.30
    mndwi_mean = jitter(mndwi_mean, 0.06)
    rows.append([year,"MNDWI",f"{mndwi_mean:.4f}",f"{jitter(lerp(-0.08,-0.17,t),0.12):.4f}",f"{jitter(lerp(0.55,0.42,t),0.05):.4f}",f"{jitter(lerp(0.11,0.16,t),0.08):.4f}"])

    if year <= 2005:
        t2 = (year - 1984) / (2005 - 1984)
        ndmi_mean = lerp(0.32, 0.15, t2)
    else:
        t2 = (year - 2005) / (2024 - 2005)
        ndmi_mean = lerp(0.15, 0.25, t2)
    if is_drought: ndmi_mean = 0.08
    if is_dana: ndmi_mean = 0.38
    ndmi_mean = jitter(ndmi_mean, 0.05)
    rows.append([year,"NDMI",f"{ndmi_mean:.4f}",f"{jitter(lerp(-0.02,0.01,t),0.2):.4f}",f"{jitter(lerp(0.60,0.50,t),0.04):.4f}",f"{jitter(lerp(0.11,0.14,t),0.08):.4f}"])

    lst_mean = lerp(23.0, 29.5, t)
    if is_drought: lst_mean = 32.0
    if is_dana: lst_mean = 25.0
    lst_mean = jitter(lst_mean, 0.03)
    rows.append([year,"LST",f"{lst_mean:.2f}",f"{jitter(lerp(16,19,t),0.05):.2f}",f"{jitter(lerp(32,40,t),0.04):.2f}",f"{jitter(lerp(3.5,5.5,t),0.08):.2f}"])

    if 2001 <= year <= 2023:
        t3 = (year - 2001) / (2023 - 2001)
        et_mean = lerp(4.2, 3.2, t3)
        if is_drought: et_mean = 2.0
        et_mean = jitter(et_mean, 0.05)
        rows.append([year,"ET",f"{et_mean:.2f}",f"{jitter(lerp(0.8,1.2,t3),0.1):.2f}",f"{jitter(lerp(7.0,6.0,t3),0.05):.2f}",f"{jitter(lerp(1.2,1.7,t3),0.08):.2f}"])

    precip_mean = lerp(480, 400, t) + random.uniform(-40, 40)
    if is_drought: precip_mean = 220
    if is_dana: precip_mean = 750
    rows.append([year,"Precipitation",f"{precip_mean:.1f}",f"{jitter(lerp(280,220,t),0.08):.1f}",f"{jitter(lerp(650,580,t),0.06):.1f}",f"{jitter(lerp(60,100,t),0.1):.1f}"])

with open("/home/user/marjal/metadata/all_layers_stats.csv","w",newline="") as f:
    w = csv.writer(f)
    w.writerow(["year","layer","mean","min","max","stdDev"])
    w.writerows(rows)

dq_rows = []
for year in years:
    if year == 2012:
        scenes = 5; cloud = round(random.uniform(10, 18), 1)
    elif year <= 2011:
        scenes = random.randint(8, 18); cloud = round(random.uniform(8, 20), 1)
    else:
        scenes = random.randint(15, 25); cloud = round(random.uniform(5, 15), 1)
    min_cloud = round(random.uniform(0.5, cloud * 0.4), 1)
    gap_year = random.random() < 0.15
    fm = random.randint(2, 4) if gap_year else 1
    lm = random.randint(9, 10) if gap_year else 12
    fd = random.randint(1, 28); ld = random.randint(1, 28)
    dq_rows.append([year, scenes, cloud, min_cloud, f"{year}-{fm:02d}-{fd:02d}", f"{year}-{lm:02d}-{ld:02d}"])

with open("/home/user/marjal/metadata/data_quality.csv","w",newline="") as f:
    w = csv.writer(f)
    w.writerow(["year","scene_count","mean_cloud_cover","min_cloud_cover","first_acquisition","last_acquisition"])
    w.writerows(dq_rows)

print("Done.")
