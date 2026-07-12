import csv
import json
import sys
import os

def convert_csv_to_json(csv_filepath, json_filepath):
    """
    Convierte un archivo CSV exportado desde Google Sheets al formato JSON
    necesario para el catálogo dinámico de Distrijam.
    """
    productos_dict = {}

    try:
        with open(csv_filepath, mode='r', encoding='utf-8') as csvfile:
            # Usamos DictReader para leer las columnas por su nombre
            reader = csv.DictReader(csvfile)
            
            # Normalizamos los nombres de las columnas para evitar problemas de mayúsculas/minúsculas
            column_names = reader.fieldnames
            if not column_names:
                print("El archivo CSV está vacío.")
                return

            # Busca los nombres de las columnas (insensible a mayúsculas)
            col_producto = next((c for c in column_names if 'producto' in c.lower()), None)
            col_medida = next((c for c in column_names if 'medida' in c.lower()), None)
            col_presentacion = next((c for c in column_names if 'presentacion' in c.lower() or 'presentación' in c.lower()), None)
            col_descripcion = next((c for c in column_names if 'descripci' in c.lower()), None)

            if not col_producto or not col_medida:
                print("Error: El CSV debe contener al menos las columnas 'Producto' y 'Medida'.")
                return

            for row in reader:
                prod_name = row[col_producto].strip()
                if not prod_name:
                    continue
                
                medida = row[col_medida].strip() if col_medida else ""
                presentacion = row[col_presentacion].strip() if col_presentacion else ""
                descripcion = row[col_descripcion].strip() if col_descripcion else ""

                # Generamos un ID amigable para la URL/datos basado en el nombre del producto
                # Ej: "BULON 8.8" -> "bulon-8-8"
                prod_id = prod_name.lower().replace(' ', '-').replace('.', '-')

                if prod_id not in productos_dict:
                    productos_dict[prod_id] = {
                        "id": prod_id,
                        "name": prod_name,
                        "category": "todos", # Por defecto, puedes cambiarlo si agregas una columna Categoría
                        "image": f"imagenes/productos/{prod_id}.jpg", # Asume que las fotos se llaman como el ID
                        "description": prod_name, # Descripción general del producto
                        "variants": []
                    }

                # Agregamos la variante (medida)
                variant_id = f"{prod_id}-{len(productos_dict[prod_id]['variants']) + 1}"
                productos_dict[prod_id]["variants"].append({
                    "id": variant_id,
                    "medida": medida,
                    "presentacion": presentacion,
                    "descripcion": descripcion
                })

    except FileNotFoundError:
        print(f"Error: No se encontró el archivo '{csv_filepath}'.")
        return
    except Exception as e:
        print(f"Ocurrió un error al leer el CSV: {e}")
        return

    # Convertimos el diccionario a una lista
    productos_list = list(productos_dict.values())

    try:
        with open(json_filepath, mode='w', encoding='utf-8') as jsonfile:
            json.dump(productos_list, jsonfile, indent=2, ensure_ascii=False)
        print(f"¡Éxito! Archivo JSON generado en: {json_filepath}")
        print(f"Se procesaron {len(productos_list)} productos distintos.")
    except Exception as e:
        print(f"Ocurrió un error al guardar el JSON: {e}")

if __name__ == "__main__":
    print("=== Convertidor de CSV a JSON (Distrijam) ===")
    
    csv_file = input("Ingresa la ruta de tu archivo CSV (ej. catalogo.csv): ").strip()
    if not csv_file.endswith('.csv'):
        csv_file += '.csv'
        
    json_file = "productos.json"
    
    # Check if we should output to the parent dir if we are in scripts/
    if os.path.basename(os.getcwd()) == "scripts":
        json_file = "../productos.json"
        
    convert_csv_to_json(csv_file, json_file)
    input("Presiona Enter para salir...")
